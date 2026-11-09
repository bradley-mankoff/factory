import SwiftUI

/// RunBar's one item in the menu bar: the number of active Workflows, and a menu of them.
@main
struct RunBarApp: App {
    @StateObject private var store = RunsStore()

    var body: some Scene {
        MenuBarExtra {
            RunsView(store: store)
        } label: {
            Text(store.barLabel)
                .font(.system(size: 11, weight: .medium))
                .monospacedDigit()
        }
        .menuBarExtraStyle(.window)
    }
}
