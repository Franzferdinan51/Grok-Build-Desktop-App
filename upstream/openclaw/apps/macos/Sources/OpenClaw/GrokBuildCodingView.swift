import AppKit
import SwiftUI

struct GrokBuildCodingView: View {
    @StateObject private var backend = GrokBuildBackend()
    @State private var prompt = ""
    @State private var workspace: URL?
    @State private var model = ""
    @State private var reasoningEffort = true
    @State private var autoApproveTools = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Grok Build Coding")
                        .font(.title2.weight(.semibold))
                    Text("Native OpenClaw desktop UI · Grok Build task backend")
                        .foregroundStyle(.secondary)
                }
                Spacer()
                self.stateBadge
            }

            HStack {
                Text(self.workspace?.path ?? "Choose a project folder")
                    .lineLimit(1)
                    .foregroundStyle(self.workspace == nil ? .secondary : .primary)
                Spacer()
                Button("Choose Folder…") { self.chooseWorkspace() }
            }

            TextEditor(text: self.$prompt)
                .font(.body.monospaced())
                .frame(minHeight: 120)
                .overlay(alignment: .topLeading) {
                    if self.prompt.isEmpty {
                        Text("Describe the coding task for Grok Build…")
                            .foregroundStyle(.tertiary)
                            .padding(9)
                            .allowsHitTesting(false)
                    }
                }

            HStack {
                TextField("Optional Grok Build model", text: self.$model)
                    .textFieldStyle(.roundedBorder)
                Toggle("High reasoning", isOn: self.$reasoningEffort)
                Toggle("Auto-approve tools", isOn: self.$autoApproveTools)
            }
            .toggleStyle(.switch)

            HStack {
                Button("Run Grok Build") {
                    guard let workspace = self.workspace else { return }
                    self.backend.run(
                        prompt: self.prompt,
                        workspace: workspace,
                        model: self.model,
                        reasoningEffort: self.reasoningEffort,
                        autoApproveTools: self.autoApproveTools)
                }
                .buttonStyle(.borderedProminent)
                .disabled(self.workspace == nil || self.backend.state == .running)

                Button("Stop") { self.backend.cancel() }
                    .disabled(self.backend.state != .running)
                Spacer()
                Text("LM Studio remains operator-controlled; this view never loads a model.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Divider()
            ScrollView {
                Text(self.backend.output.isEmpty ? "Streaming output will appear here." : self.backend.output)
                    .font(.system(.body, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .frame(minHeight: 220)
        }
        .padding(20)
        .frame(minWidth: 720, minHeight: 560)
    }

    @ViewBuilder
    private var stateBadge: some View {
        switch self.backend.state {
        case .idle:
            Text("Ready").foregroundStyle(.secondary)
        case .running:
            Label("Running", systemImage: "circle.fill").foregroundStyle(.orange)
        case let .completed(status):
            Text(status == 0 ? "Completed" : "Exited \(status)")
                .foregroundStyle(status == 0 ? .green : .orange)
        case let .unavailable(message), let .failed(message):
            Text(message).foregroundStyle(.red).lineLimit(1)
        }
    }

    private func chooseWorkspace() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK {
            self.workspace = panel.url
        }
    }
}
