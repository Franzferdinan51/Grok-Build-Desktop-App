import SwiftUI

struct GrokBuildSettingsView: View {
    @State private var drafts: [String: String] = [:]
    @State private var configured = Set<String>()
    @State private var endpoints: [String: String] = [:]
    @State private var models: [String: String] = [:]
    @State private var notice = ""

    var body: some View {
        Form {
            Section("Grok Build model providers") {
                Text("LM Studio, ODS, MiniMax, and API models remain Grok Build model targets. Credentials are stored in Keychain and injected only into Grok CLI.")
                    .foregroundStyle(.secondary)
                ForEach(GrokProviderPreset.all) { provider in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack { Text(provider.label).font(.headline); Spacer(); if self.configured.contains(provider.id) { Label("Configured", systemImage: "checkmark.circle.fill").foregroundStyle(.green) } }
                        Text(provider.environmentKey).font(.caption).foregroundStyle(.secondary)
                        HStack {
                            TextField("Base URL", text: Binding(get: { self.endpoints[provider.id, default: provider.baseURL] }, set: { self.endpoints[provider.id] = $0 }))
                            TextField("Model ID", text: Binding(get: { self.models[provider.id, default: ""] }, set: { self.models[provider.id] = $0 }))
                            Button("Save endpoint") { self.saveSettings(provider) }
                        }
                        HStack {
                            SecureField("API key (optional for local providers)", text: Binding(get: { self.drafts[provider.id, default: ""] }, set: { self.drafts[provider.id] = $0 }))
                            Button("Save") { self.save(provider) }.disabled(self.drafts[provider.id, default: ""].isEmpty)
                            if self.configured.contains(provider.id) { Button("Remove") { GrokProviderKeyStore.remove(provider.environmentKey); self.configured.remove(provider.id) } }
                        }
                    }.padding(.vertical, 4)
                }
            }
            Section("Model catalog") { Text("Models and endpoint definitions live in ~/.grok/config.toml and appear in both apps through `grok models`. No local model is loaded automatically.") }
            if !self.notice.isEmpty { Text(self.notice).foregroundStyle(.secondary) }
        }
        .formStyle(.grouped).padding().frame(minWidth: 680, minHeight: 460)
        .onAppear { self.configured = Set(GrokProviderPreset.all.filter { GrokProviderKeyStore.value(for: $0.environmentKey) != nil }.map(\.id)); self.endpoints = Dictionary(uniqueKeysWithValues: GrokProviderPreset.all.map { ($0.id, GrokProviderKeyStore.endpoint(for: $0)) }); self.models = Dictionary(uniqueKeysWithValues: GrokProviderPreset.all.map { ($0.id, GrokProviderKeyStore.modelID(for: $0)) }) }
    }
    private func save(_ provider: GrokProviderPreset) {
        do { try GrokProviderKeyStore.save(self.drafts[provider.id, default: ""], for: provider.environmentKey); self.drafts[provider.id] = ""; self.configured.insert(provider.id); self.notice = "Saved securely in Keychain." }
        catch { self.notice = error.localizedDescription }
    }
    private func saveSettings(_ provider: GrokProviderPreset) {
        do { try GrokProviderKeyStore.saveSettings(provider: provider, endpoint: self.endpoints[provider.id, default: provider.baseURL], modelID: self.models[provider.id, default: ""]); self.notice = "Provider endpoint saved to Grok Build's model catalog." }
        catch { self.notice = error.localizedDescription }
    }
}
