import XCTest
@testable import RunBarCore

/// The seam is the Archon CLI: these fixtures are trimmed copies of what
/// `archon workflow runs --all --json` and `archon workflow get <id> --json --verbose`
/// printed on this Mac on 2026-11-09, with the fields RunBar reads and nothing else.
private func fixture(_ name: String) throws -> Data {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .appendingPathComponent("Fixtures")
        .appendingPathComponent(name)
    return try Data(contentsOf: url)
}


/// One temporary Mac: a Profile naming an Archon home under it, one project folder, and a
/// stub `archon` at the home's binary path that writes down how it was called and prints
/// the fixture it is given. The stub stands for the CLI, the one edge these tests reach
/// past: everything inside RunBar runs for real.
private func macWithStubArchon(
    printing fixture: String, failing said: String? = nil
) throws -> (home: URL, log: URL) {
    let home = URL(fileURLWithPath: NSTemporaryDirectory()).resolvingSymlinksInPath()
        .appendingPathComponent("runbar-\(UUID().uuidString)")
    let config = home.appendingPathComponent(".config/factory")
    try FileManager.default.createDirectory(at: config, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(
        at: home.appendingPathComponent("repo"), withIntermediateDirectories: true
    )
    let log = home.appendingPathComponent("archon.log")
    try """
    ARCHON_HOME=$HOME/archon
    LIBRARY=$HOME/archon/workflows
    """.write(to: config.appendingPathComponent("profile"), atomically: true, encoding: .utf8)
    try "\(home.appendingPathComponent("repo").path)\n".write(
        to: config.appendingPathComponent("projects"), atomically: true, encoding: .utf8
    )

    let bin = home.appendingPathComponent("archon/bin")
    try FileManager.default.createDirectory(at: bin, withIntermediateDirectories: true)
    let stub = bin.appendingPathComponent("archon")
    let body =
        said.map { """
        #!/bin/sh
        printf '%s\n' "\($0)" >&2
        exit 1
        """ } ?? """
        #!/bin/sh
        printf 'ARCHON_HOME=%s cwd=%s args=%s\n' "${ARCHON_HOME-}" "$PWD" "$*" >> "\(log.path)"
        cat "\(fixture)"
        """
    try body.write(to: stub, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: stub.path)
    return (home, log)
}

/// What the stub was called with, one call a line. A process started in the temporary
/// folder reports it with /private in front, because that is where /var leads; the prefix
/// is dropped so a call reads as the folders the test made.
private func calls(_ log: URL) throws -> [String] {
    try String(contentsOf: log, encoding: .utf8)
        .split(separator: "\n")
        .map { String($0).replacingOccurrences(of: "/private/var/", with: "/var/") }
}

final class ArchonTests: XCTestCase {
    func testTheMenuListsEachActiveWorkflowWithItsProjectPmAndBead() throws {
        let runs = try Archon.activeRuns(in: fixture("runs.json"))

        // The fixture also holds a completed run, which is no longer active.
        XCTAssertEqual(runs.map(\.id), [
            "839baa6f962cabe6141fc93b60d6777e",
            "56aade6ad504848e67c42df45824e4f1",
        ])

        let factory = runs[1]
        XCTAssertEqual(factory.project, "factory")
        XCTAssertEqual(factory.pm, "pm-factory")
        XCTAssertEqual(factory.bead, "fac-s6f")
        XCTAssertEqual(factory.workflowName, "factory-build")
        XCTAssertEqual(factory.currentNode, "work")
        XCTAssertEqual(factory.title, "factory · fac-s6f")
    }

    func testAnExpandedWorkflowListsEveryNodeAndMarksTheCurrentOne() throws {
        let nodes = try Archon.nodes(in: fixture("get.json"))

        // The Workflow's own order, not the order its nodes have run so far.
        XCTAssertEqual(nodes.map(\.id), [
            "bead", "prompts", "work", "checks", "work-finished", "spec", "standards",
            "recheck", "spec-withheld", "standards-withheld", "land", "tell-project-manager",
        ])
        XCTAssertEqual(nodes.map(\.state), [
            "completed", "completed", "running", "pending", "pending", "pending",
            "pending", "pending", "pending", "pending", "pending", "pending",
        ])
        XCTAssertEqual(nodes.filter(\.isCurrent).map(\.id), ["work"])
    }

    func testRunsArePolledFromArchonInThisMacsHomeFromAProjectFolder() throws {
        let fixturePath = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().appendingPathComponent("Fixtures/runs.json").path
        let (home, log) = try macWithStubArchon(printing: fixturePath)

        let runs = try ArchonHome(home: home).activeRuns()

        XCTAssertEqual(runs.map(\.title), ["herdr-click-open · herdr-click-open-0h4", "factory · fac-s6f"])
        XCTAssertEqual(try calls(log), [
            "ARCHON_HOME=\(home.path)/archon cwd=\(home.path)/repo args=workflow runs --all --json",
        ])
    }

    func testAnExpandedWorkflowAsksForThatRunsOwnNodes() throws {
        let fixturePath = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().appendingPathComponent("Fixtures/get.json").path
        let (home, log) = try macWithStubArchon(printing: fixturePath)

        let nodes = try ArchonHome(home: home).nodes(of: "56aade6ad504848e67c42df45824e4f1")

        XCTAssertEqual(nodes.filter(\.isCurrent).map(\.id), ["work"])
        XCTAssertEqual(try calls(log), [
            "ARCHON_HOME=\(home.path)/archon cwd=\(home.path)/repo args=workflow get 56aade6ad504848e67c42df45824e4f1 --json --verbose",
        ])
    }

    func testTheRunsAreReadFromTheHomeTheShippedProfileNames() throws {
        let fixturePath = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().appendingPathComponent("Fixtures/runs.json").path
        let (home, log) = try macWithStubArchon(printing: fixturePath)
        // The example Profile this repo ships: comments, quoted values and $HOME, exactly
        // as the Mac's own Profile is written.
        let shipped = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("config/profile")
        try String(contentsOf: shipped, encoding: .utf8).write(
            to: home.appendingPathComponent(".config/factory/profile"),
            atomically: true, encoding: .utf8
        )
        // Its ARCHON_HOME is $HOME/.local/share/factory/archon, so the stub moves there.
        let installed = home.appendingPathComponent(".local/share/factory/archon/bin")
        try FileManager.default.createDirectory(at: installed, withIntermediateDirectories: true)
        try FileManager.default.moveItem(
            at: home.appendingPathComponent("archon/bin/archon"),
            to: installed.appendingPathComponent("archon")
        )

        XCTAssertEqual(try ArchonHome(home: home).activeRuns().count, 2)
        XCTAssertEqual(try calls(log), [
            "ARCHON_HOME=\(home.path)/.local/share/factory/archon cwd=\(home.path)/repo args=workflow runs --all --json",
        ])
    }

    func testWhenArchonCannotBeReadTheMenuSaysWhatArchonSaid() throws {
        let (home, _) = try macWithStubArchon(
            printing: "", failing: "Error: Not in a git repository."
        )

        XCTAssertThrowsError(try ArchonHome(home: home).activeRuns()) { error in
            XCTAssertEqual(error.localizedDescription, "Error: Not in a git repository.")
        }
    }
}
