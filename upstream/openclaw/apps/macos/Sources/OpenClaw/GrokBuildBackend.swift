import Combine
import Foundation

/// The native coding backend for Grok Build Desktop.
///
/// This uses Grok Build's documented headless CLI contract rather than
/// inventing a sidecar API: `grok -p … --cwd … --output-format streaming-json`.
@MainActor
final class GrokBuildBackend: ObservableObject {
    enum State: Equatable {
        case idle
        case running
        case completed(Int32)
        case unavailable(String)
        case failed(String)
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var output = ""

    private var process: Process?
    private var currentRunID: UUID?
    private var currentSessionID: String?

    func run(
        prompt: String,
        workspace: URL,
        model: String?,
        reasoningEffort: Bool,
        autoApproveTools: Bool)
    {
        guard !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            self.state = .failed("Enter a coding task first.")
            return
        }
        guard !FileManager.default.fileExists(atPath: workspace.path) else {
            self.state = .failed("The selected workspace is unavailable.")
            return
        }
        self.cancel()
        self.output = ""
        self.state = .running
        self.currentSessionID = nil
        self.currentRunID = GrokRunStore.shared.start(prompt: prompt, workspace: workspace, model: model)

        let task = Process()
        let outputPipe = Pipe()
        task.standardOutput = outputPipe
        task.standardError = outputPipe

        let configuredPath = ProcessInfo.processInfo.environment["GROK_BUILD_PATH"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        var arguments: [String]
        if let configuredPath, !configuredPath.isEmpty {
            task.executableURL = URL(fileURLWithPath: configuredPath)
            arguments = []
        } else {
            task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            arguments = ["grok"]
        }
        arguments += ["-p", prompt, "--cwd", workspace.path, "--output-format", "streaming-json"]
        if let model, !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            arguments += ["--model", model]
        }
        if reasoningEffort {
            arguments += ["--reasoning-effort", "high"]
        }
        if autoApproveTools {
            arguments.append("--yolo")
        }
        task.arguments = arguments
        task.terminationHandler = { [weak self] completedTask in
            Task { @MainActor in
                guard let self, self.process === completedTask else { return }
                let runID = self.currentRunID
                let sessionID = self.currentSessionID
                self.process = nil
                self.currentRunID = nil
                GrokRunStore.shared.finish(
                    id: runID ?? UUID(),
                    status: completedTask.terminationStatus == 0 ? .completed : .failed,
                    sessionID: sessionID,
                    error: completedTask.terminationStatus == 0 ? nil : "Grok Build exited \(completedTask.terminationStatus)")
                self.state = .completed(completedTask.terminationStatus)
            }
        }

        do {
            try task.run()
            self.process = task
            Task { [weak self] in
                guard let self else { return }
                do {
                    for try await line in outputPipe.fileHandleForReading.bytes.lines {
                        self.appendStreamingLine(String(line))
                    }
                } catch {
                    if self.process != nil {
                        self.state = .failed(error.localizedDescription)
                    }
                }
            }
        } catch {
            if let runID = self.currentRunID {
                GrokRunStore.shared.finish(id: runID, status: .failed, error: error.localizedDescription)
            }
            self.currentRunID = nil
            self.state = .unavailable("Could not start Grok Build: \(error.localizedDescription)")
        }
    }

    func cancel() {
        guard let process else { return }
        process.terminate()
        if let runID = self.currentRunID {
            GrokRunStore.shared.finish(id: runID, status: .cancelled, sessionID: self.currentSessionID)
        }
        self.currentRunID = nil
        self.process = nil
        self.state = .idle
    }

    private func appendStreamingLine(_ line: String) {
        self.captureSessionID(from: line)
        let display = Self.displayText(for: line)
        guard !display.isEmpty else { return }
        self.output += (self.output.isEmpty ? "" : "\n") + display
    }

    private func captureSessionID(from line: String) {
        guard let data = line.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        self.currentSessionID = (object["session_id"] as? String) ?? (object["sessionId"] as? String) ?? self.currentSessionID
    }

    private static func displayText(for line: String) -> String {
        guard let data = line.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return line }

        for key in ["text", "content", "message", "error"] {
            if let value = object[key] as? String, !value.isEmpty { return value }
        }
        return line
    }
}
