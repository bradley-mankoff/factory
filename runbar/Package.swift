// swift-tools-version: 5.9
import PackageDescription

// The Factory's menu bar item: one line per active Workflow, expandable to its nodes.
// RunBarCore holds what can be tested without a window: reading Archon's runs and a run's
// nodes through the Archon CLI. RunBar is the app, one MenuBarExtra.
let package = Package(
    name: "RunBar",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "RunBar", targets: ["RunBar"]),
        .library(name: "RunBarCore", targets: ["RunBarCore"]),
    ],
    targets: [
        .target(name: "RunBarCore", path: "Sources/RunBarCore"),
        .executableTarget(name: "RunBar", dependencies: ["RunBarCore"], path: "Sources/RunBar"),
        .testTarget(name: "RunBarCoreTests", dependencies: ["RunBarCore"], path: "Tests/RunBarCoreTests"),
    ]
)
