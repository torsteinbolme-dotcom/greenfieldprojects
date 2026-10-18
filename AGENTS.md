<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- `src/financialEngine.ts` and `src/exampleProject.ts` are the user's authoritative files, kept verbatim; never change formulas without asking the user first. Why: these are the investment calculations the user signed off on.
- All outputs are computed client-side from stored inputs (`scenario_assumptions` JSONB, append-only versions); never store outputs edited by hand. Why: results stay deterministic and every version can be audited.
- Every table has `organization_id`; RLS uses `is_org_member` / `can_edit_org` / `is_org_admin` (security definer). Why: one organization must never see another's data.
- Saving a scenario inserts a new version row; the Base scenario is a separate row, so edits elsewhere never overwrite it. Why: scenario isolation and version history.
- New signups get their own organization plus a seeded Project Mountain (`handle_new_user` trigger). Why: every account starts with a working example.
