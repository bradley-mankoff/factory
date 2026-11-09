import Foundation

/// What the menu bar shows of Archon, read from the two readings of the Archon CLI:
/// `archon workflow runs --all --json` for the active Workflows, and
/// `archon workflow get <id> --json --verbose` for one Workflow's nodes.
public enum Archon {
    /// One Run, as the menu's line: the project and the Bead it builds, its Workflow, and
    /// the node it stands on now.
    public struct Run: Identifiable, Equatable {
        public let id: String
        public let project: String
        public let pm: String?
        public let bead: String?
        public let workflowName: String
        public let currentNode: String?
        public let status: String

        /// `factory · fac-s6f`, the menu's one line. A Run started by hand names no Bead,
        /// so its Workflow stands in for one.
        public var title: String { "\(project) · \(bead ?? workflowName)" }

        /// A Run is active until it ends. Archon ends a Run as completed, failed or
        /// cancelled; anything else, paused and pending included, is still live and worth
        /// a line in the menu.
        public var isActive: Bool {
            !["completed", "failed", "cancelled"].contains(status)
        }
    }

    /// One node of a Workflow, and whether the Run stands on it now.
    public struct Node: Identifiable, Equatable {
        public let id: String
        public let state: String

        /// Archon reports the node it is working in as running.
        public var isCurrent: Bool { state == "running" }
    }

    /// A failure the menu bar shows in words, because a Mac with no Archon, or with a
    /// Profile that names no project folder, still has to say why the list is empty.
    public struct Failure: LocalizedError, Equatable {
        public let message: String
        public var errorDescription: String? { message }
        public init(_ message: String) { self.message = message }
    }

    /// The active Runs of `archon workflow runs --all --json`, in the order Archon lists
    /// them, which puts the most recently started first.
    public static func activeRuns(in data: Data) throws -> [Run] {
        let reply = try decode(RunsReply.self, from: data)
        if let error = reply.error { throw Failure(error) }
        return (reply.runs ?? []).compactMap { $0.run }.filter(\.isActive)
    }

    /// Every node of the Workflow a `archon workflow get <id> --json --verbose` reply
    /// describes, in Workflow order, with the node the Run stands on marked current. The
    /// reply lists only the nodes that have run, so the Workflow's order comes from its
    /// terminal graph and a node not listed there yet is pending.
    public static func nodes(in data: Data) throws -> [Node] {
        let reply = try decode(GetReply.self, from: data)
        if let error = reply.error { throw Failure(error) }
        let states = Dictionary(
            (reply.nodes ?? []).map { ($0.nodeId, $0.state) },
            uniquingKeysWith: { first, _ in first }
        )
        let order = reply.metadata?.terminalGraph?.nodeIds ?? []
        let ids = order.isEmpty ? (reply.nodes ?? []).map(\.nodeId) : order
        return ids.map { Node(id: $0, state: states[$0] ?? "pending") }
    }

    private static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw Failure(
                "Archon's reply could not be read: \(error.localizedDescription)"
            )
        }
    }
}

// The CLI's JSON, with its snake_case keys, and one Run's own message turned into the
// Project Manager and the Bead it names: `<pane> · <bead id>` (the Workflow's opening
// message), such as `pm-factory · fac-s6f`.
private struct RunsReply: Decodable {
    let ok: Bool?
    let error: String?
    let runs: [RunReply]?

    enum CodingKeys: String, CodingKey { case ok, error, runs }
}

private struct RunReply: Decodable {
    let id: String
    let workflowName: String?
    let userMessage: String?
    let status: String?
    let codebaseName: String?
    let currentNode: String?
    let activeNodes: [String]?

    enum CodingKeys: String, CodingKey {
        case id
        case workflowName = "workflow_name"
        case userMessage = "user_message"
        case status
        case codebaseName = "codebase_name"
        case currentNode = "current_step_name"
        case activeNodes = "active_nodes"
    }

    var run: Archon.Run? {
        guard let workflowName else { return nil }
        let named = Self.openingMessage(userMessage)
        let project =
            codebaseName?.split(separator: "/").last.map(String.init)
            ?? named.pm.map { String($0.dropFirst("pm-".count)) }
            ?? workflowName
        return Archon.Run(
            id: id,
            project: project,
            pm: named.pm,
            bead: named.bead,
            workflowName: workflowName,
            currentNode: currentNode ?? activeNodes?.first,
            status: status ?? "unknown"
        )
    }

    /// The opening message a Workflow started with: the pane's name, then the Bead's id.
    /// A Run started by hand has a sentence instead, which names neither.
    static func openingMessage(_ message: String?) -> (pm: String?, bead: String?) {
        let parts = (message ?? "").components(separatedBy: " · ")
        guard let pm = parts.first, pm.hasPrefix("pm-") else { return (nil, nil) }
        return (pm, parts.count > 1 ? parts[1] : nil)
    }
}

private struct GetReply: Decodable {
    let ok: Bool?
    let error: String?
    let metadata: Metadata?
    let nodes: [NodeReply]?

    enum CodingKeys: String, CodingKey { case ok, error, metadata, nodes }

    struct Metadata: Decodable {
        let terminalGraph: Graph?

        enum CodingKeys: String, CodingKey { case terminalGraph = "terminal_graph" }

        struct Graph: Decodable {
            let nodeIds: [String]

            enum CodingKeys: String, CodingKey { case nodeIds = "node_ids" }
        }
    }
}

private struct NodeReply: Decodable {
    let nodeId: String
    let state: String

    enum CodingKeys: String, CodingKey { case nodeId, state }
}
