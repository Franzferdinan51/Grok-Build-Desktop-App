import Foundation
import Security

struct GrokProviderPreset: Identifiable {
    let id: String; let label: String; let environmentKey: String; let baseURL: String
    static let all = [
        GrokProviderPreset(id: "lm-studio", label: "LM Studio", environmentKey: "LM_STUDIO_API_KEY", baseURL: "http://localhost:1234/v1"),
        GrokProviderPreset(id: "ods", label: "ODS", environmentKey: "ODS_API_KEY", baseURL: "http://localhost:8080/v1"),
        GrokProviderPreset(id: "minimax", label: "MiniMax", environmentKey: "MINIMAX_API_KEY", baseURL: "https://api.minimax.io/v1"),
        GrokProviderPreset(id: "openai-compatible", label: "OpenAI-compatible provider", environmentKey: "OPENAI_COMPATIBLE_API_KEY", baseURL: "https://api.example.com/v1"),
    ]
}

enum GrokProviderKeyStore {
    private static let service = "ai.grokbuild.provider"
    static func save(_ value: String, for key: String) throws {
        remove(key)
        let status = SecItemAdd([kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key, kSecValueData: Data(value.utf8)] as CFDictionary, nil)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }
    static func value(for key: String) -> String? {
        var item: CFTypeRef?
        let status = SecItemCopyMatching([kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key, kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne] as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func remove(_ key: String) { SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key] as CFDictionary) }
    static var environment: [String: String] { Dictionary(uniqueKeysWithValues: GrokProviderPreset.all.compactMap { preset in value(for: preset.environmentKey).map { (preset.environmentKey, $0) } }) }

    static func endpoint(for provider: GrokProviderPreset) -> String { UserDefaults.standard.string(forKey: "grok.provider.\(provider.id).url") ?? provider.baseURL }
    static func modelID(for provider: GrokProviderPreset) -> String { UserDefaults.standard.string(forKey: "grok.provider.\(provider.id).model") ?? "" }
    static func saveSettings(provider: GrokProviderPreset, endpoint: String, modelID: String) throws {
        guard let url = URL(string: endpoint), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { throw NSError(domain: "GrokProvider", code: 1, userInfo: [NSLocalizedDescriptionKey: "Use a valid HTTP or HTTPS URL."]) }
        guard modelID.isEmpty || modelID.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { throw NSError(domain: "GrokProvider", code: 2, userInfo: [NSLocalizedDescriptionKey: "Model ID may contain letters, numbers, underscores, and hyphens."]) }
        UserDefaults.standard.set(endpoint, forKey: "grok.provider.\(provider.id).url")
        UserDefaults.standard.set(modelID, forKey: "grok.provider.\(provider.id).model")
        try writeManagedModels()
    }
    private static func writeManagedModels() throws {
        let config = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".grok/config.toml")
        let start = "# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS", end = "# END GROK BUILD DESKTOP MANAGED PROVIDERS"
        let blocks = GrokProviderPreset.all.compactMap { provider -> String? in
            let model = modelID(for: provider); guard !model.isEmpty else { return nil }
            return "[model.\(model)]\nbase_url = \"\(endpoint(for: provider))\"\nmodel_name = \"\(model)\"\napi_backend = \"chat_completions\"\nenv_key = \"\(provider.environmentKey)\""
        }.joined(separator: "\n\n")
        let managed = "\(start)\n\(blocks)\n\(end)"
        var existing = (try? String(contentsOf: config, encoding: .utf8)) ?? ""
        if let range = existing.range(of: "\(NSRegularExpression.escapedPattern(for: start))[\\s\\S]*?\(NSRegularExpression.escapedPattern(for: end))", options: .regularExpression) { existing.replaceSubrange(range, with: managed) }
        else { existing += "\n\n\(managed)\n" }
        try FileManager.default.createDirectory(at: config.deletingLastPathComponent(), withIntermediateDirectories: true)
        try existing.write(to: config, atomically: true, encoding: .utf8)
    }
}
