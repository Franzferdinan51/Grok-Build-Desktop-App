import Foundation
import Security

struct GrokProviderPreset: Identifiable {
    let id: String; let label: String; let environmentKey: String; let baseURL: String
    static let all = [
        GrokProviderPreset(id: "lm-studio", label: "LM Studio", environmentKey: "LM_STUDIO_API_KEY", baseURL: "http://localhost:1234/v1"),
        GrokProviderPreset(id: "ods", label: "ODS", environmentKey: "ODS_API_KEY", baseURL: "http://localhost:8080/v1"),
        GrokProviderPreset(id: "minimax", label: "MiniMax", environmentKey: "MINIMAX_API_KEY", baseURL: "https://api.minimax.io/v1"),
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
}
