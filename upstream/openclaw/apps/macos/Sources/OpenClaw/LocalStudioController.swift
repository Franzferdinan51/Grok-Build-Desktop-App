import Combine
import Foundation

/// Read-only client for a user-configured Local Studio controller.
///
/// It intentionally calls only documented inspection routes: `/health`,
/// `/status`, and `/gpus`. Model launch, eviction, downloads, and recipes stay
/// in Local Studio until a separate explicit command policy is reviewed.
@MainActor
final class LocalStudioController: ObservableObject {
    static let shared = LocalStudioController()

    @Published var baseURLString: String
    @Published private(set) var isReachable = false
    @Published private(set) var snapshot = ""
    @Published private(set) var error: String?

    private init() {
        self.baseURLString = UserDefaults.standard.string(forKey: "localStudio.baseURL") ?? ""
    }

    func saveAndRefresh() async {
        let value = self.baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else {
            UserDefaults.standard.removeObject(forKey: "localStudio.baseURL")
            self.snapshot = ""
            self.error = nil
            self.isReachable = false
            return
        }
        guard let url = URL(string: value), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            self.error = "Local Studio URL must use http or https."
            self.isReachable = false
            return
        }
        let baseURL = url.absoluteString.hasSuffix("/") ? String(url.absoluteString.dropLast()) : url.absoluteString
        self.baseURLString = baseURL
        UserDefaults.standard.set(baseURL, forKey: "localStudio.baseURL")

        do {
            async let health = self.fetch(baseURL: baseURL, path: "/health")
            async let status = self.fetch(baseURL: baseURL, path: "/status")
            async let gpus = self.fetch(baseURL: baseURL, path: "/gpus")
            let payload: [String: Any] = ["health": try await health, "status": try await status, "gpus": try await gpus]
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            self.snapshot = String(decoding: data, as: UTF8.self)
            self.error = nil
            self.isReachable = true
        } catch {
            self.error = error.localizedDescription
            self.isReachable = false
        }
    }

    private func fetch(baseURL: String, path: String) async throws -> Any {
        guard let url = URL(string: baseURL + path) else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONSerialization.jsonObject(with: data)
    }
}
