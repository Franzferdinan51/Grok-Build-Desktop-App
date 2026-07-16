import Combine
import Foundation

/// Persistent local history for native Grok Build coding runs.
///
/// The record is metadata only: prompt, workspace, outcome, and a Grok CLI
/// session id when the documented stream supplies one. No credentials or model
/// weights are stored here.
struct GrokRunRecord: Codable, Identifiable, Equatable {
    enum Status: String, Codable {
        case running
        case completed
        case failed
        case cancelled
    }

    let id: UUID
    let prompt: String
    let workspacePath: String
    let model: String?
    let startedAt: Date
    var finishedAt: Date?
    var status: Status
    var grokSessionID: String?
    var error: String?
}

@MainActor
final class GrokRunStore: ObservableObject {
    static let shared = GrokRunStore()

    @Published private(set) var runs: [GrokRunRecord] = []
    private let maxRuns = 100

    private init() {
        self.runs = (try? Self.load(from: Self.storageURL)) ?? []
    }

    @discardableResult
    func start(prompt: String, workspace: URL, model: String?) -> UUID {
        let record = GrokRunRecord(
            id: UUID(),
            prompt: prompt,
            workspacePath: workspace.path,
            model: model?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? model : nil,
            startedAt: Date(),
            status: .running)
        self.runs.insert(record, at: 0)
        self.runs = Array(self.runs.prefix(self.maxRuns))
        self.save()
        return record.id
    }

    func finish(id: UUID, status: GrokRunRecord.Status, sessionID: String? = nil, error: String? = nil) {
        guard let index = self.runs.firstIndex(where: { $0.id == id }) else { return }
        self.runs[index].status = status
        self.runs[index].finishedAt = Date()
        self.runs[index].grokSessionID = sessionID ?? self.runs[index].grokSessionID
        self.runs[index].error = error
        self.save()
    }

    private func save() {
        try? FileManager.default.createDirectory(
            at: Self.storageURL.deletingLastPathComponent(),
            withIntermediateDirectories: true)
        guard let data = try? JSONEncoder().encode(self.runs) else { return }
        try? data.write(to: Self.storageURL, options: .atomic)
    }

    private static func load(from url: URL) throws -> [GrokRunRecord] {
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode([GrokRunRecord].self, from: data)
    }

    private static var storageURL: URL {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return directory.appendingPathComponent("GrokBuildDesktop", isDirectory: true).appendingPathComponent("runs.json")
    }
}
