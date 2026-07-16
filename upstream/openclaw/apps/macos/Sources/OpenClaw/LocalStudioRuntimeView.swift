import SwiftUI

struct LocalStudioRuntimeView: View {
    @ObservedObject private var controller = LocalStudioController.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Local Studio Runtime Monitor").font(.title2.weight(.semibold))
            Text("Optional read-only GPU and runtime monitor. Grok Build remains the coding backend; this never loads or evicts a model.")
                .foregroundStyle(.secondary)
            HStack {
                TextField("http://127.0.0.1:8080", text: self.$controller.baseURLString)
                    .textFieldStyle(.roundedBorder)
                Button("Save + Refresh") { Task { await self.controller.saveAndRefresh() } }
                    .buttonStyle(.borderedProminent)
            }
            if let error = self.controller.error {
                Text(error).foregroundStyle(.red)
            } else if self.controller.isReachable {
                Text("Controller connected").foregroundStyle(.green)
            } else if self.controller.baseURLString.isEmpty {
                Text("Add a Local Studio controller URL to enable monitoring.").foregroundStyle(.secondary)
            }
            ScrollView {
                Text(self.controller.snapshot.isEmpty ? "Runtime status will appear here." : self.controller.snapshot)
                    .font(.system(.body, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .frame(minHeight: 300)
        }
        .padding(20)
        .frame(minWidth: 720, minHeight: 500)
    }
}
