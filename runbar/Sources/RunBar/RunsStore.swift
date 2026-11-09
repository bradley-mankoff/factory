import Foundation
import RunBarCore

/// What the menu bar shows: the active Workflows, and the nodes of the ones opened. The
/// list is polled, so a Run that starts, moves or ends shows up without a click; an opened
/// Workflow's nodes are read again on every poll, so its current node keeps up too.
@MainActor
final class RunsStore: ObservableObject {
    /// Nil until the first read of Archon. An empty list is a Mac with nothing running.
    @Published private(set) var runs: [Archon.Run]?
    @Published private(set) var nodes: [String: [Archon.Node]] = [:]
    /// Why one Workflow's nodes could not be read, said in its own opened menu.
    @Published private(set) var nodeProblems: [String: String] = [:]
    /// Why the list is empty, in Archon's or the Profile's own words.
    @Published private(set) var problem: String?
    @Published private(set) var updated: Date?
    @Published private(set) var opened: Set<String> = []
    /// Loading nodes for these Workflows now, so a slow read is not asked for twice.
    private var loading: Set<String> = []

    private let archon: ArchonHome
    private let interval: TimeInterval
    private var timer: Timer?

    init(archon: ArchonHome = ArchonHome(), interval: TimeInterval = 15) {
        self.archon = archon
        self.interval = interval
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    /// How many Workflows are running, for the menu bar itself.
    var barLabel: String {
        guard let runs, !runs.isEmpty else { return "▶" }
        return "▶ \(runs.count)"
    }

    var summary: String {
        guard let runs else { return "Reading Archon\u{2026}" }
        switch runs.count {
        case 0: return "No active Workflows"
        case 1: return "1 active Workflow"
        default: return "\(runs.count) active Workflows"
        }
    }

    func refresh() {
        let archon = self.archon
        Task {
            let read = await Task.detached(priority: .utility) {
                Result { try archon.activeRuns() }
            }.value
            switch read {
            case .success(let runs):
                self.runs = runs
                self.problem = nil
                // A Workflow that ended leaves the list, and its nodes go with it.
                self.opened.formIntersection(Set(runs.map(\.id)))
                self.nodes = self.nodes.filter { self.opened.contains($0.key) }
                self.nodeProblems = self.nodeProblems.filter { self.opened.contains($0.key) }
            case .failure(let error):
                self.runs = []
                self.problem = error.localizedDescription
            }
            self.updated = Date()
            for id in self.opened { self.load(id) }
        }
    }

    func toggle(_ id: String) {
        if opened.contains(id) {
            opened.remove(id)
        } else {
            opened.insert(id)
            load(id)
        }
    }

    /// One Workflow's nodes, asked of Archon. A failed read is the Workflow's own line in
    /// the menu: the rest of the list is unaffected.
    private func load(_ id: String) {
        guard !loading.contains(id) else { return }
        loading.insert(id)
        let archon = self.archon
        Task {
            let read = await Task.detached(priority: .utility) {
                Result { try archon.nodes(of: id) }
            }.value
            self.loading.remove(id)
            switch read {
            case .success(let nodes):
                self.nodes[id] = nodes
                self.nodeProblems[id] = nil
            case .failure(let error):
                self.nodeProblems[id] = error.localizedDescription
            }
        }
    }
}
