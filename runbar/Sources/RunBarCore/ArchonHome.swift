import Foundation

/// This Mac's Archon: the home its Profile names, a folder of a project Archon reads the
/// project from, and the two readings of its CLI the menu bar shows. Both Macs run the same
/// binary against their own home because the Profile names it here (fac-qpv.6.3).
public struct ArchonHome {
    public let home: URL

    public init(home: URL = URL(fileURLWithPath: NSHomeDirectory())) {
        self.home = home
    }

    /// The active Workflows, from `archon workflow runs --all --json`.
    public func activeRuns() throws -> [Archon.Run] {
        try Archon.activeRuns(in: read(["workflow", "runs", "--all", "--json"]))
    }

    /// One Run's nodes, from `archon workflow get <id> --json --verbose`.
    public func nodes(of runID: String) throws -> [Archon.Node] {
        try Archon.nodes(in: read(["workflow", "get", runID, "--json", "--verbose"]))
    }

    private var profilePath: URL { home.appendingPathComponent(".config/factory/profile") }

    /// The binary the Profile points at, in a project folder. Archon reads the project from
    /// the folder it runs in, so it runs in the first project this Mac lists, the way
    /// bin/board starts the board. The wrapper in ~/.local/bin is not used: it is not on a
    /// login job's PATH, and the Profile already names everything the wrapper exports.
    private func read(_ arguments: [String]) throws -> Data {
        let settings = try profile()
        let archonHome = settings["ARCHON_HOME"] ?? ""
        guard !archonHome.isEmpty else {
            throw Archon.Failure("\(profilePath.path) names no ARCHON_HOME, so RunBar cannot find Archon")
        }
        let binary = URL(fileURLWithPath: archonHome).appendingPathComponent("bin/archon")
        guard FileManager.default.isExecutableFile(atPath: binary.path) else {
            throw Archon.Failure("Archon is not installed at \(binary.path)")
        }

        let process = Process()
        process.executableURL = binary
        process.arguments = arguments
        process.currentDirectoryURL = try projectFolder()
        var environment = ProcessInfo.processInfo.environment
        environment["ARCHON_HOME"] = archonHome
        if let library = settings["LIBRARY"] { environment["LIBRARY"] = library }
        // The same quieting the wrapper in ~/.local/bin exports.
        environment["ARCHON_TELEMETRY_DISABLED"] = "1"
        environment["DO_NOT_TRACK"] = "1"
        environment["PI_SKIP_VERSION_CHECK"] = "1"
        process.environment = environment

        let output = Pipe()
        let errors = Pipe()
        process.standardOutput = output
        process.standardError = errors
        do {
            try process.run()
        } catch {
            throw Archon.Failure("Archon at \(binary.path) could not be started: \(error.localizedDescription)")
        }
        let outputData = output.fileHandleForReading.readDataToEndOfFile()
        let errorData = errors.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            let said = String(decoding: errorData, as: UTF8.self)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            throw Archon.Failure(
                said.isEmpty ? "archon exited \(process.terminationStatus)" : said
            )
        }
        return outputData
    }

    /// The Profile's KEY=value lines, with this Mac's home spelled out, as a shell would
    /// read the file. The file is plain shell on purpose, so this reads only what the
    /// Factory writes there.
    private func profile() throws -> [String: String] {
        guard let text = try? String(contentsOf: profilePath, encoding: .utf8) else {
            throw Archon.Failure("no Profile at \(profilePath.path); scripts/install.sh puts one there")
        }
        var settings: [String: String] = [:]
        for line in contentLines(of: text) {
            guard let equals = line.firstIndex(of: "=") else { continue }
            let key = line[..<equals]
                .replacingOccurrences(of: "export ", with: "")
                .trimmingCharacters(in: .whitespaces)
            var value = line[line.index(after: equals)...].trimmingCharacters(in: .whitespaces)
            if value.count >= 2, value.hasPrefix("\""), value.hasSuffix("\"") {
                value = String(value.dropFirst().dropLast())
            }
            value = value
                .replacingOccurrences(of: "${HOME}", with: home.path)
                .replacingOccurrences(of: "$HOME", with: home.path)
            settings[key] = value
        }
        return settings
    }

    /// The first folder of ~/.config/factory/projects that is still there.
    private func projectFolder() throws -> URL {
        let path = home.appendingPathComponent(".config/factory/projects")
        let text = (try? String(contentsOf: path, encoding: .utf8)) ?? ""
        for folder in contentLines(of: text) {
            var isFolder: ObjCBool = false
            if FileManager.default.fileExists(atPath: folder, isDirectory: &isFolder), isFolder.boolValue {
                return URL(fileURLWithPath: folder)
            }
        }
        throw Archon.Failure(
            "no project folder in \(path.path), so Archon cannot tell which project this is; add one with scripts/install.sh <repo>"
        )
    }

    /// The lines of a file under ~/.config/factory that carry a setting: trimmed, with the
    /// blank lines and comments install writes beside them dropped.
    private func contentLines(of text: String) -> [String] {
        text.split(separator: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !$0.hasPrefix("#") }
    }
}
