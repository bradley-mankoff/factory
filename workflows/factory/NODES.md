# Nodes

The node library: every kind of node the core Workflows use, so a Project Manager can build a
Workflow of its own by pasting what it needs. Read it beside the `archon` skill, which has the full
syntax. An agent's prompt text lives in the Factory's `prompts/` folder,
`~/.local/share/factory/prompts/`, which the `prompts` node prints; this page names it only.

Paste a snippet into the `nodes:` list of a Workflow folder, beside its `fixtures/`, then run
`archon workflow test <name>`. An AI node names a role, never a model: its `model:` is a role such
as `@work`, whose Chain sets the model and thinking level (the Human, 2026-11-06), so write no
`effort:` and no seat. Its prompt starts with `$prompts.output.<prompt>` for its kind; a checked
node's also starts with `$prompts.output.marker_<node>`, which finds its file in the Workflow's
`flows/`, while a review node has none, since Archon holds it to its `output_format`.

## The AI nodes

### The work agent (`work`)

Builds a Bead test first, at the seam it names, checks it and commits. This is the node a build is
built around. Prompt `work` (`prompts/work.md`); role `@work`; tools: all of pi's; Flows
`flows/work`: `changed-files`, `check-passes`, `closing-account`.

```yaml
  - id: work
    depends_on: [bead, prompts]
    model: "@work"
    idle_timeout: 300000
    prompt: |
      $prompts.output.marker_work
      $prompts.output.work

      $bead.output
```

### The task agent (`task`)

Does a Bead in one step, with no review: gives the answer the Bead asks for as its last message, or
makes the change the Bead spells out and commits it. For a research answer, a brainstorm, a plan, or
work one careful step can finish. Prompt `task` (`prompts/task.md`); role `@work`; tools: all of
pi's; Flows `flows/task`: `closing-account`.

```yaml
  - id: task
    depends_on: [bead, prompts]
    model: "@work"
    idle_timeout: 300000
    prompt: |
      $prompts.output.marker_task
      $prompts.output.task

      $bead.output
```

### The spec review agent (`spec`)

Reads the diff and judges only whether it does what the Bead and its Epic's Spec asked, no less and
no more, and whether anything ends in an error. It changes nothing. Prompt `review_spec`
(`prompts/review_spec.md`); role `@spec-review`, whose Chain is its own because this review matters
most; tools: read and bash; no Flows file. Its `output_format` is the review verdict the nodes after
it read.

```yaml
  - id: spec
    depends_on: [work-finished]
    model: "@spec-review"
    idle_timeout: 300000
    allowed_tools: [read, bash]
    prompt: |
      $prompts.output.review_spec

      The diff is `git diff $BASE_BRANCH...HEAD`; the commits are `git log --oneline $BASE_BRANCH..HEAD`.

      $bead.output

      $checks.output
    output_format: {type: object, properties: {approved: {type: boolean}, feedback: {type: string}}, required: [approved, feedback]}
```

### The standards review agent (`standards`)

Judges whether the change follows the repo's coding standards and avoids a baseline of code smells,
fixing inside the diff what it finds and committing; it withholds only for a defect it cannot fix
there. Prompt `review_standards` (`prompts/review_standards.md`); role `@standards-review` (the
`@work` Chain); tools: all of pi's; no Flows file; the same verdict.

```yaml
  - id: standards
    depends_on: [spec]
    when: "$spec.output.approved == true"
    model: "@standards-review"
    idle_timeout: 300000
    prompt: |
      $prompts.output.review_standards

      The diff is `git diff $BASE_BRANCH...HEAD`; the commits are `git log --oneline $BASE_BRANCH..HEAD`.

      $bead.output
    output_format: {type: object, properties: {approved: {type: boolean}, feedback: {type: string}}, required: [approved, feedback]}
```

### The demo agent (`demo`)

Records a video of the change working for a Human gate, following the `record-demo` skill, and
changes nothing in the repo. Role `@work`; tools: read, bash and write; prompt: written into the
node; no Flows file, because the gate reads the video's file.

```yaml
  - id: demo
    depends_on: [land-hold]
    model: "@work"
    idle_timeout: 300000
    allowed_tools: [read, bash, write]
    prompt: |
      Record a demo video of this Bead's change working, for the Human's taste-and-fit
      check. Read ~/.local/share/factory/skills/record-demo/SKILL.md and follow it. Save
      the video as "$FACTORY_DEMOS/$WORKFLOW_ID.mp4" (FACTORY_DEMOS is in your
      environment). Do not change, commit or push any file in this repo.

      $bead.output
```

### The research agents (`look-a`, `look-b`)

Two independent looks at one question, in parallel, each writing its findings and evidence to a file
in the Run's artifacts, so the Project Manager's context stays free. Role `@work`; tools: read and
bash; prompt: written into the node; Flows `flows/look-a` and `flows/look-b`: `file-exists
findings-a.md` and `file-exists findings-b.md`, each with `no-changes`.

```yaml
  - id: look-a
    depends_on: [prompts]
    model: "@work"
    idle_timeout: 300000
    allowed_tools: [read, bash]
    prompt: |
      $prompts.output.marker_look_a
      Research this question for a Project Manager who will act on the answer.
      The message starts with the Project Manager's pane and " · "; the question follows:
      $ARGUMENTS

      Read the repo, its docs and anything installed; use curl for public web pages.
      Do not change any file in the repo. Write your findings, with the evidence for
      each (file paths, URLs, command output), to $ARTIFACTS_DIR/findings-a.md.

  - id: look-b
    depends_on: [prompts]
    model: "@work"
    idle_timeout: 300000
    allowed_tools: [read, bash]
    prompt: |
      $prompts.output.marker_look_b
      Research this question for a Project Manager who will act on the answer.
      The message starts with the Project Manager's pane and " · "; the question follows:
      $ARGUMENTS

      Read the repo, its docs and anything installed; use curl for public web pages.
      Do not change any file in the repo. Write your findings, with the evidence for
      each (file paths, URLs, command output), to $ARTIFACTS_DIR/findings-b.md.
```

### The combining agent (`combine`)

Reads the two research files and writes one that opens with the answer in at most five sentences,
then where they agree, where they disagree and what is unknown. Role `@work`; tools: read and write;
prompt: written into the node; Flows `flows/combine`: `file-exists findings.md`, `no-changes`.

```yaml
  - id: combine
    depends_on: [look-a, look-b]
    model: "@work"
    idle_timeout: 300000
    allowed_tools: [read, write]
    prompt: |
      $prompts.output.marker_combine
      The Run's message starts with the Project Manager's pane and " · "; the question follows: $ARGUMENTS
      Two researchers answered it. Their findings are in $ARTIFACTS_DIR/findings-a.md and $ARTIFACTS_DIR/findings-b.md.
      Write one combined account to $ARTIFACTS_DIR/findings.md. Begin it with the answer
      in at most five sentences, then where they agree, where they disagree and which
      evidence is stronger, and what is still unknown.
```

## The shell nodes

### The Bead and the prompts (`bead`, `prompts`)

`bead` prints the Bead from the end of the Run's message, so each later node takes it from
`$bead.output`. `prompts` prints the Factory's prompts as JSON and one Flows marker for each file in
the Workflow's `flows/`, and fails, naming the file, when a Flows file names no node or a prompt
asks for a marker no Flows file produces. Every Workflow with an AI node has it; the last word is
this Workflow's folder, so change it to yours.

```yaml
  - id: bead
    bash: '"$HOME/.local/share/factory/bin/bead" "$ARGUMENTS"'

  - id: prompts
    bash: '"$HOME/.local/share/factory/bin/node-prompts" "${LIBRARY:-$ARCHON_HOME/workflows}/factory/build"'
```

### The checks (`checks`)

Runs the project's check command, `FACTORY_CHECK` from the project's `.archon/.env`, and prints its
last forty lines under `CHECKS PASSED` or `CHECKS FAILED`. The work agent was held to the same check
by its Flows file while it worked; this runs it in a shell node after the agent has finished.

```yaml
  - id: checks
    depends_on: [work]
    bash: |
      if out=$(sh -c "$FACTORY_CHECK" 2>&1); then r=PASSED; else r=FAILED; fi
      printf 'CHECKS %s\n%s\n' "$r" "$(printf '%s\n' "$out" | tail -40)"
```

A Workflow whose node may answer instead of commit has no check to run: it marks the Run so the
landing skips, and the answer is the node's last message. This is how `factory-task` tells a
research answer from a change.

```yaml
  - id: checks
    depends_on: [task]
    bash: |
      if [ -z "$(git log --oneline "$BASE_BRANCH..HEAD")" ]; then
        touch "$ARTIFACTS_DIR/no-commits"; echo "CHECKS SKIPPED: the Run made no commits"
      else
        sh -c "$FACTORY_CHECK"
      fi
```

### The checks after the work (`work-finished`, `recheck`)

`work-finished` reads the Flows failures the work agent finished with, and when there are any it
comments them on the Bead and fails, so neither review runs and no usage is spent reviewing
unfinished work. `recheck` runs the checks again after the standards review, which may have changed
files, and fails the node, and so stops the landing, when they fail.

```yaml
  - id: work-finished
    depends_on: [checks]
    bash: '"$HOME/.local/share/factory/bin/work-finished" "$("$HOME/.local/share/factory/bin/bead" --id "$ARGUMENTS")"'

  - id: recheck
    depends_on: [standards]
    when: "$standards.output.approved == true"
    bash: |
      out=$(sh -c "$FACTORY_CHECK" 2>&1); status=$?
      printf '%s\n' "$out" | tail -40
      exit $status
```

### The withheld review (`spec-withheld`, `standards-withheld`)

A withheld review's findings go on the Bead as a comment, so the Project Manager can decide, and the
landing does not run.

```yaml
  - id: spec-withheld
    depends_on: [spec]
    when: "$spec.output.approved == false"
    bash: |
      bd comments add "$("$HOME/.local/share/factory/bin/bead" --id "$ARGUMENTS")" "$(cat <<'FEEDBACK'
      Spec review withheld approval in Run $WORKFLOW_ID; the commits stay on its branch:
      $spec.output.feedback
      FEEDBACK
      )"

  - id: standards-withheld
    depends_on: [standards]
    when: "$standards.output.approved == false"
    bash: |
      bd comments add "$("$HOME/.local/share/factory/bin/bead" --id "$ARGUMENTS")" "$(cat <<'FEEDBACK'
      Standards review withheld approval in Run $WORKFLOW_ID; the commits stay on its branch:
      $standards.output.feedback
      FEEDBACK
      )"
```

### The landing (`land`)

Lands the Run's commits the way the Mac's Profile says: a pull request into the base branch and its
squash merge, or the commits squashed onto the base branch, checked again and pushed. It refuses a
protected target before any git command moves a branch, and is the pull request, the merge and the
push in one node.

```yaml
  - id: land
    depends_on: [recheck]
    bash: '"$HOME/.local/share/factory/bin/land"'
```

A Workflow with a Human gate holds it before the base branch moves: `--hold` opens the pull request,
or squashes the commits and checks the squashed tree, then stops and leaves a `held` note naming
what it holds, which the gate quotes.

```yaml
  - id: land-hold
    depends_on: [recheck]
    bash: '"$HOME/.local/share/factory/bin/land" --hold'
```

## The Human gate

### The question and the wait (`ask-human`, `taste`)

`ask-human` tells the Project Manager's pane that the Run waits at the Human's taste-and-fit check,
naming what the landing holds and the demo video's path. It reads the video from its file, not from
`$demo.output`, so a failed demo still lets the Human judge from what the landing holds; with no
video it says so, and the Project Manager records one or rejects the Run. `taste` holds the Run for
the answer, written as `wait: {attention: ..., form: approval}`; the deprecated `approval:` gate is
never used. The question is taste and fit only: how the new piece looks and feels, and whether it
fits the Idea; an error is never a taste question.

```yaml
  - id: ask-human
    depends_on: [demo]
    trigger_rule: all_done
    bash: |
      held=$(cat "$ARTIFACTS_DIR/held" 2>/dev/null) || exit 1
      demo="$FACTORY_DEMOS/$WORKFLOW_ID.mp4"
      if [ -s "$demo" ]; then video="Relay it through FactoryClaw with the demo video $demo and without a link to the change."; else video="There is no video: the demo node found the change broken or failed (archon workflow get $WORKFLOW_ID says which). If the change is broken, reject the Run and rework the Bead without asking the Human; otherwise record one with the record-demo skill, or relay the change instead."; fi
      "$HOME/.local/share/factory/bin/tell-pm" "${ARGUMENTS%% · *}" "Run $WORKFLOW_ID (factory-build-gated) for Bead $("$HOME/.local/share/factory/bin/bead" --id "$ARGUMENTS") waits for the Human's taste-and-fit check of $held. $video Then answer with archon workflow approve $WORKFLOW_ID or archon workflow reject $WORKFLOW_ID --reason '<the Human's words>'."

  - id: taste
    depends_on: [ask-human]
    wait:
      attention: "Taste and fit for Bead $ARGUMENTS: does $land-hold.output look and feel right, and does it fit the Idea?"
      form: approval
```

### The registration and the notice (`registered`, `tell-project-manager`)

`registered` registers a repo with Archon from its main checkout: one shell node, no model, and
no Bead.

```yaml
  - id: registered
    bash: echo "registered $(pwd)"
```

The notice is the last node of every Workflow, marked `all_done` so it runs however the Run ended. It reads the
Run's notes, never a node's output, because Archon refuses to splice a failed node's output, which
would stop the notice when it is most needed. Its argument is that Workflow's name.

```yaml
  - id: tell-project-manager
    depends_on: [land, work-finished, spec-withheld, standards-withheld]
    trigger_rule: all_done
    bash: '"$HOME/.local/share/factory/bin/finish" factory-build'
```

