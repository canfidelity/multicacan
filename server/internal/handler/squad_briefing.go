package handler

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/canfidelity/multicacan/server/internal/util"
	db "github.com/canfidelity/multicacan/server/pkg/db/generated"
)

// squadOperatingProtocol is the hard-coded system-level briefing prepended to
// every squad-leader claim. It explains the leader's coordinator role, the
// @mention dispatch mechanism, and the stop-after-dispatch contract.
//
// Keep this text English-only (matches existing agent-harness conventions)
// and keep the mention syntax exactly aligned with util.MentionRe — the
// "Squad Roster" block below renders concrete examples that round-trip
// through util.ParseMentions, and the protocol text refers to that format.
const squadOperatingProtocol = `## Squad Operating Protocol

You are the LEADER of a squad. Your job is to **coordinate**, not to execute
the work yourself.

Your responsibilities, in order:

1. **Read the issue** (title, description, latest comments, acceptance
   criteria) and decide which squad member is best suited to do the work.
2. **Delegate by @mention — only when there is actual work to assign.**
   Post a comment ONLY if you are delegating work to a member. That
   comment must @mention the chosen member(s) and tell them what to do.
   - **Be terse.** Every Multicacan agent already has full context of the
     issue (title, description, all prior comments, attachments) and
     the surrounding workspace. Do NOT restate or summarise the
     issue body, prior discussion, or known facts in your delegation
     comment — they read it themselves.
   - Say only what cannot be inferred from the issue: who you're
     picking, why them (one short clause), and any *additional*
     constraints, hints, or sequencing you want them to follow.
     Two or three sentences is usually plenty.
   - Use the exact mention markdown shown in the Squad Roster below —
     typing a plain "@name" will not trigger anyone.
   - **Do NOT post any comment for no_action or failed outcomes.**
     Only the ` + "`" + `multicacan squad activity` + "`" + ` command is needed — no comment.
3. **Record your evaluation.** After every trigger — whether you delegated,
   decided no action is needed, or encountered an error — record it:
   ` + "`" + `multicacan squad activity <issue-id> <outcome> --reason "<short reason>"` + "`" + `
   Outcome values: ` + "`" + `action` + "`" + ` (you delegated or acted),
   ` + "`" + `no_action` + "`" + ` (you evaluated and decided nothing is needed),
   ` + "`" + `failed` + "`" + ` (you hit an error).
   This is mandatory on every turn — it records your decision in the
   issue timeline so humans can see you evaluated the trigger.
4. **Stop after dispatching.** Once your delegation comment is posted
   and evaluation recorded, end your turn. Do not continue working,
   do not write code, do not open files. You will be re-triggered
   automatically when:
   - a delegated member posts an update or asks you a question;
   - a delegated member finishes and the issue moves forward;
   - someone @mentions you again on this issue.
5. **Re-evaluate on each trigger.** When you wake up again, read the new
   activity and decide whether to delegate the next step, escalate to
   the human reporter, or close the loop. When a member reports back
   after completing delegated work, record ` + "`" + `no_action` + "`" + ` and exit silently —
   no acknowledgment comment, no summary, no "great work" message.
   Only trigger another delegation if the member explicitly says the
   task failed, asks for further guidance, or the issue clearly needs
   more work that hasn't been started.

Hard rules:
- EVERY delegation MUST use the full mention markdown syntax
  ` + "`" + `[@Name](mention://<type>/<UUID>)` + "`" + ` exactly as shown in the Squad
  Roster. A plain "@name" or bare name does NOT trigger the agent —
  if you skip the mention link, the task is never delivered and the
  issue stalls. This is non-negotiable: no mention link = no delegation.
- NEVER post a comment for ` + "`" + `no_action` + "`" + ` or ` + "`" + `failed` + "`" + ` outcomes. Record
  the outcome with ` + "`" + `multicacan squad activity` + "`" + ` and exit. A comment
  after no_action re-triggers member agents and creates an infinite loop.
- When a member reports back after completing delegated work, record
  ` + "`" + `no_action` + "`" + ` and exit — do NOT acknowledge, summarize, or post any
  comment. Silence is the correct response when work is done.
- Do NOT restate the issue body or prior comments in your delegation —
  the assignee already has them. Repeating context is noise that
  buries the actual instruction.
- Do NOT do the implementation work yourself unless the squad has no
  other suitable members. The squad exists so work is split — bypassing
  it defeats the point.
- Do NOT @mention members who don't appear in the Squad Roster below;
  they are not part of this squad.
- One delegation comment per turn is enough. Avoid spamming multiple
  near-identical comments.
- If the squad has no member capable of the task, post a comment
  explaining the gap (and @mention the issue's reporter if possible)
  rather than silently doing the work.
- ALWAYS call ` + "`" + `multicacan squad activity` + "`" + ` before ending your turn —
  even when the outcome is no_action.
- A child issue you create with ` + "`" + `--status todo` + "`" + ` and an agent assignee
  already fires that agent automatically — the assignment IS the trigger.
  If you also @mention the same agent on this parent issue for the same
  work, the agent runs twice in parallel (once from the mention, once
  from the assignment). Pick exactly one path: either delegate by
  @mention on this issue, or create a ` + "`" + `todo` + "`" + ` child issue assigned to
  them. Never both for the same work.`

// buildSquadLeaderBriefing composes the full system briefing appended to a
// squad leader's Instructions when it claims a task on a squad-assigned
// issue. The returned string contains:
//
//  1. Squad Operating Protocol (constant, system-level rules).
//  2. Squad Roster.
//  3. Project Roadmap (if the issue belongs to a project with milestones).
//  4. Squad Instructions (user-defined `squad.instructions`, omitted when empty).
//
// Archived agent members are skipped. Members whose underlying record can't be
// loaded are also skipped silently.
func buildSquadLeaderBriefing(ctx context.Context, q *db.Queries, squad db.Squad) string {
	return buildSquadLeaderBriefingForIssue(ctx, q, squad, db.Issue{})
}

func buildSquadLeaderBriefingForIssue(ctx context.Context, q *db.Queries, squad db.Squad, issue db.Issue) string {
	var sb strings.Builder
	sb.WriteString(squadOperatingProtocol)
	sb.WriteString("\n\n")
	sb.WriteString(buildSquadRoster(ctx, q, squad))

	if issue.ProjectID.Valid {
		if roadmap := buildProjectRoadmapSection(ctx, q, issue.ProjectID); roadmap != "" {
			sb.WriteString("\n\n")
			sb.WriteString(roadmap)
		}
	}

	if trimmed := strings.TrimSpace(squad.Instructions); trimmed != "" {
		sb.WriteString("\n\n## Squad Instructions (")
		sb.WriteString(squad.Name)
		sb.WriteString(")\n\n")
		sb.WriteString(trimmed)
	}
	return sb.String()
}

// buildProjectRoadmapSection renders the "## Project Roadmap" section for a
// squad leader task, giving the leader visibility into the project's mission
// and which milestones are pending so it can sequence delegation correctly.
func buildProjectRoadmapSection(ctx context.Context, q *db.Queries, projectID pgtype.UUID) string {
	proj, err := q.GetProject(ctx, projectID)
	if err != nil {
		return ""
	}
	milestones, err := q.ListProjectMilestones(ctx, projectID)
	if err != nil || len(milestones) == 0 {
		if !proj.Mission.Valid || proj.Mission.String == "" {
			return ""
		}
	}

	var sb strings.Builder
	sb.WriteString("## Project Roadmap\n\n")
	if proj.Mission.Valid && proj.Mission.String != "" {
		sb.WriteString("**Mission:** ")
		sb.WriteString(proj.Mission.String)
		sb.WriteString("\n")
	}
	sb.WriteString("**Execution:** ")
	sb.WriteString(proj.ExecutionStatus)
	sb.WriteString("\n\n")

	if len(milestones) > 0 {
		sb.WriteString("Milestones (your roadmap — work through these in order):\n")
		for _, m := range milestones {
			switch m.Status {
			case "done":
				sb.WriteString("- [x] ")
			case "in_progress":
				sb.WriteString("- [~] ")
			default:
				sb.WriteString("- [ ] ")
			}
			sb.WriteString(m.Title)
			if m.IssueID.Valid {
				sb.WriteString(fmt.Sprintf(" (issue: %s)", util.UUIDToString(m.IssueID)))
			}
			sb.WriteString("\n")
		}
		sb.WriteString("\n")
		sb.WriteString("Rules for roadmap-driven work:\n")
		sb.WriteString("- Pick the first unchecked [ ] milestone and create a child issue for it, then delegate.\n")
		sb.WriteString("- After delegating, link the milestone to the issue: `multicacan project milestone update <milestone-id> --status in_progress --issue-id <issue-id>`\n")
		sb.WriteString("- You can add new milestones anytime: `multicacan project milestone add --title \"...\" [--issue-id <id>]`\n")
		sb.WriteString("- List milestones: `multicacan project milestone list --output json`\n")
		sb.WriteString("- When execution_status is \"paused\" or \"stopped\", do NOT start new milestones.\n")
		sb.WriteString("- You will be re-triggered automatically when any issue in this project moves to in_review or done.\n")
	}

	return sb.String()
}

// buildSquadRoster renders the "## Squad Roster" section: a leader self-row
// plus one row per non-archived member, with literal mention markdown.
func buildSquadRoster(ctx context.Context, q *db.Queries, squad db.Squad) string {
	var sb strings.Builder
	sb.WriteString("## Squad Roster\n\n")

	// Leader self-row. Leaders are always agents (FK enforced in schema).
	leaderName := "Leader"
	if leader, err := q.GetAgent(ctx, squad.LeaderID); err == nil {
		leaderName = leader.Name
	}
	sb.WriteString("Leader (you):\n")
	sb.WriteString("- ")
	sb.WriteString(leaderName)
	sb.WriteString(" — agent — `")
	sb.WriteString(formatMention(leaderName, "agent", util.UUIDToString(squad.LeaderID)))
	sb.WriteString("`\n")

	members, err := q.ListSquadMembers(ctx, squad.ID)
	if err != nil {
		members = nil
	}

	rows := make([]string, 0, len(members))
	for _, m := range members {
		// Skip the leader if they happen to also be in the member list —
		// they're already shown above and we don't want self-delegation.
		if m.MemberType == "agent" && util.UUIDToString(m.MemberID) == util.UUIDToString(squad.LeaderID) {
			continue
		}
		row := renderMemberRow(ctx, q, m)
		if row != "" {
			rows = append(rows, row)
		}
	}

	if len(rows) == 0 {
		sb.WriteString("\nMembers: (none — you are the only member of this squad)\n")
		return sb.String()
	}

	sb.WriteString("\nMembers:\n")
	for _, r := range rows {
		sb.WriteString(r)
	}
	return sb.String()
}

// renderMemberRow renders a single roster row, returning "" if the member
// can't be resolved or should be skipped (e.g. archived agent).
func renderMemberRow(ctx context.Context, q *db.Queries, m db.SquadMember) string {
	id := util.UUIDToString(m.MemberID)
	role := strings.TrimSpace(m.Role)
	switch m.MemberType {
	case "agent":
		ag, err := q.GetAgent(ctx, m.MemberID)
		if err != nil {
			return ""
		}
		if ag.ArchivedAt.Valid {
			return ""
		}
		return formatRosterRow(ag.Name, "agent", role, formatMention(ag.Name, "agent", id))
	case "member":
		user, err := q.GetUser(ctx, m.MemberID)
		if err != nil {
			return ""
		}
		// Mention syntax for humans uses the user_id (matches the rest of
		// the product — see util.MentionRe and frontend mention payloads).
		userID := util.UUIDToString(m.MemberID)
		return formatRosterRow(user.Name, "member (human)", role, formatMention(user.Name, "member", userID))
	default:
		return ""
	}
}

func formatRosterRow(name, kind, role, mention string) string {
	var sb strings.Builder
	sb.WriteString("- ")
	sb.WriteString(name)
	sb.WriteString(" — ")
	sb.WriteString(kind)
	if role != "" {
		sb.WriteString(`, role: "`)
		sb.WriteString(role)
		sb.WriteString(`"`)
	}
	sb.WriteString(" — `")
	sb.WriteString(mention)
	sb.WriteString("`\n")
	return sb.String()
}

// formatMention emits a mention markdown string that round-trips through
// util.ParseMentions. The label is the human display name; the link target
// uses the mention:// scheme with the entity type and UUID.
func formatMention(name, mentionType, id string) string {
	return "[@" + name + "](mention://" + mentionType + "/" + id + ")"
}
