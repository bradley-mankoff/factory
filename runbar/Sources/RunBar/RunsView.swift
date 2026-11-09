import SwiftUI
import AppKit
import RunBarCore

/// The menu itself: a line for each active Workflow, which opens to that Workflow's nodes
/// with the one the Run stands on marked.
struct RunsView: View {
    @ObservedObject var store: RunsStore

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text(store.summary)
                        .font(.headline)
                    if let problem = store.problem {
                        Text(problem)
                            .font(.caption)
                            .foregroundColor(.red)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(store.runs ?? []) { run in
                        workflow(run)
                    }
                }
                .padding(12)
            }
            .frame(width: 380)
            .frame(maxHeight: 640)
            .fixedSize(horizontal: false, vertical: true)
            Divider()
            footer
        }
    }

    private func workflow(_ run: Archon.Run) -> some View {
        let opened = store.opened.contains(run.id)
        return VStack(alignment: .leading, spacing: 6) {
            Button {
                store.toggle(run.id)
            } label: {
                HStack(alignment: .firstTextBaseline) {
                    Text(opened ? "\u{25BE}" : "\u{25B8}")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(run.title)
                        .font(.callout)
                        .lineLimit(1)
                    Spacer()
                    Text(node(run))
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundColor(presentation(run.status).color)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if opened {
                let nodes = store.nodes[run.id]
                VStack(alignment: .leading, spacing: 2) {
                    if let problem = store.nodeProblems[run.id] {
                        Text(problem)
                            .font(.caption2)
                            .foregroundColor(.red)
                            .fixedSize(horizontal: false, vertical: true)
                    } else if let nodes {
                        ForEach(nodes) { node in
                            let shown = presentation(node.state)
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text(shown.glyph)
                                    .font(.caption2)
                                    .frame(width: 10)
                                    .foregroundColor(shown.color)
                                Text(node.id)
                                    .font(.caption)
                                    .bold(node.isCurrent)
                                    .foregroundColor(node.isCurrent ? .primary : .secondary)
                            }
                        }
                    } else {
                        Text("Reading the Workflow\u{2026}")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.leading, 20)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(0.05)))
    }

    /// The node the Run stands on, or what the Run is waiting with.
    private func node(_ run: Archon.Run) -> String {
        run.currentNode ?? run.status
    }

    private var footer: some View {
        HStack {
            Text(updatedText)
                .font(.caption)
                .foregroundColor(.secondary)
            Spacer()
            Button("Refresh") { store.refresh() }
            Button("Quit") { NSApp.terminate(nil) }
        }
        .padding(8)
    }

    private var updatedText: String {
        guard let updated = store.updated else { return "Reading\u{2026}" }
        let secs = Int(Date().timeIntervalSince(updated))
        if secs < 5 { return "Updated just now" }
        if secs < 60 { return "Updated \(secs)s ago" }
        return "Updated \(secs / 60)m ago"
    }

    /// A state's mark and colour in the menu, in one table: a state Archon adds is one line
    /// here and nothing else.
    private func presentation(_ state: String) -> (glyph: String, color: Color) {
        switch state {
        case "completed": return ("\u{2713}", .green)
        case "running": return ("\u{25B6}", .accentColor)
        case "failed": return ("\u{2717}", .red)
        case "skipped", "cancelled": return ("\u{2013}", .secondary)
        default: return ("\u{00B7}", .secondary)
        }
    }
}
