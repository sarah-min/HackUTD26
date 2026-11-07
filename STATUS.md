# Status and handoffs

This is the index only. **Each part logs progress in its own append-only file**, so four people and their LLMs never edit the same status file:

| Part | Log | Owner |
|---|---|---|
| 1. Capture App & UX | [status/part1.md](status/part1.md) | unassigned |
| 2. Realtime Backend & Live Report | [status/part2.md](status/part2.md) | unassigned |
| 3. AI Pipeline (Nemotron) | [status/part3.md](status/part3.md) | unassigned |
| 4. Recovery Navigator & Infra | [status/part4.md](status/part4.md) | unassigned |

## Entry format (newest at the top of your file)

```markdown
## YYYY-MM-DD HH:MM: <short title>  (branch / PR #)
- **Shipped:** what now works on main
- **Verify:** command or click path
- **Fixtures still faked:** …
- **VERIFY results:** provider facts confirmed or disproved (model IDs, limits, SDK syntax)
- **Requests to other parts:** `P2: please add optional field X to report.ts`
- **Blocked on:** …
```

## Integration checkpoints (tick when true on the deployed URL)

- [ ] Scaffold on main; everyone rebased (P1)
- [ ] Module on Maincloud + bindings + provider hooks (P2)
- [ ] Real Nemotron VL call returns a valid FrameFinding (P3)
- [ ] Presigned upload to Vultr Object Storage; VM serving HTTPS (P4)
- [ ] **Vertical slice:** upload → worker → findings → assessment visible live on /report/[id] (phone + second device)
- [ ] 911 banner + safety guidance + `needs_more_footage` re-shoot flow
- [ ] Agent tools + trace
- [ ] Recovery Navigator + what-if
- [ ] Coach chat
- [ ] Initial Devpost submitted (Sat 11 PM)
- [ ] Demo recorded on `demo/freeze` (Sun 10:30 AM)
- [ ] Final Devpost submitted (Sun 12 PM)
