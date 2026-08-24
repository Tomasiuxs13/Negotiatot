# Influencer Manager Workflow Audit

**Audit date:** 18 August 2026  
**App reviewed:** Counterpart development build  
**Perspective:** An influencer manager who wants to automate repetitive work while keeping financial and approval decisions under human control

## Scope

This audit follows one collaboration from initial lead capture through completion, then checks the cross-deal views used for daily management. It focuses on clarity, ease of use, workflow continuity, data accuracy, and opportunities to remove manual work.

The following ideas were deliberately excluded from the recommendations:

- Email inbox sync and scheduled follow-ups
- Automatic platform or affiliate metric imports
- E-signature, accounting, and payout integrations

The first pass tested the missing-key experience. A follow-up pass then used the configured AI and media providers with synthetic report, contract, brief, audio, and video fixtures. This allowed the upload, extraction, recommendation, source-confirmation, and integration-check paths to run end to end without exposing real creator or campaign information. AI wording is non-deterministic, so the audit evaluates workflow behavior and safety boundaries rather than exact prose.

## Executive summary

The app already covers substantially more of the influencer-management lifecycle than a typical pipeline tracker. It connects negotiation, contract terms, onboarding, creator submissions, approvals, payment readiness, shipping, actuals, and partner history in one workspace. The public creator portal and state-aware generated messages are especially promising because they reduce manager coordination without requiring a creator account.

The main risk is not missing functionality; it is that several screens calculate or describe the same deal differently. Commission, ROAS, product cost, platform attribution, usage/exclusivity rights, and dashboard labels can currently lead a manager to make the wrong commercial decision. The configured-AI follow-up exposed a particularly serious version of this problem: a mixed YouTube and Instagram deal was priced as Instagram, while the YouTube report's reach was applied to both deliverables. The second major issue is workflow continuity: important transitions are drag-only, returning-creator data appears late, and generated contracts, signed documents, fulfillment records, and shipments do not yet behave like one continuous plan.

**Current status:** the implementation pass later in this document resolves the audited
commission, platform attribution, rights pricing, ROAS labelling, stage-action, shipment,
repeat-partner prefill and mobile-overflow failures. It also adds the first internal
operations-autopilot release: agreement preparation, setup exceptions and creator date
requests. The original findings below remain as the evidence trail for why each change was
made; the implementation-progress table is the current source of truth.

### Highest-priority findings

1. **Commission can be recalculated using the wrong model.** A deal agreed at 8% commission produced a $4,800 commission on 120 orders because playbook per-order tiers were applied. At $9,600 revenue, the agreed percentage would be $768.
2. **Mixed-platform pricing can use the wrong platform and reach.** Selecting YouTube and Instagram produced an Instagram-primary deal; Instagram CPM was applied to both deliverables and the YouTube report's 128,400 average views was reused for both.
3. **Rights are captured but omitted from the four-number guardrails.** Three months of paid usage and one month of named-category exclusivity were described as being priced “on top,” while anchor, target, walkaway, and breakeven excluded them.
4. **ROAS is inconsistent with “True cost.”** The audited deal displayed 3.31x ROAS using the $2,900 fee while the same screen displayed $7,770 true cost. All-in ROAS would be approximately 1.24x.
5. **Manually added content can have no platform.** On a YouTube and Instagram deal, the item disappeared under platform filters and was later attributed to the first platform for benchmarking.
6. **Several pipeline shortcuts do not create the requested stage.** For example, “add to Agreed” opened the normal new-deal form and created an analysis-stage deal.
7. **Shipping can be marked shipped without a carrier or tracking number.** Once shipped, those empty fields disappear, preventing correction in the interface.
8. **Fulfillment overflows horizontally on a 390 px mobile viewport.** This affects the operational part of the product where managers are most likely to work on the go.

## Workflow map

```text
Playbook setup
    ↓
Lead → Contacted → Analysis → Offer sent → Negotiating → Agreed
                                                        ↓
                                           Contract / source confirmation
                                                        ↓
                                           Onboarding and product delivery
                                                        ↓
                                    Content production → review → posted → verified
                                                        ↓
                                      Payment approval → paid + actuals logged
                                                        ↓
                                                   Completed
                                                        ↓
                                              Partner history / repeat deal
```

The lifecycle is understandable once a deal is open. The weakest transitions are from negotiation to agreement, from contract to tracked fulfillment work, and from a completed partner to a prefilled repeat deal.

## Test legend

- **Passed:** The task completed and the result was clear.
- **Passed with friction:** The task worked, but wording or interaction added avoidable effort.
- **Issue:** The task completed incorrectly, produced inconsistent data, or led to a dead end.
- **Coverage gap:** The scenario could not be completed in the automated browser and needs a short manual check.

## Step-by-step walkthrough

### 1. Understand the daily workload from the dashboard

**What was tested**

- Reviewed active-deal count, tasks waiting on the manager, attention list, payment summary, and completed-deal performance.
- Rechecked the dashboard after content submission, payment state changes, actuals, and completion.

**Result: Issue**

The dashboard is visually scannable and the content-review action appeared immediately after a creator submitted a draft. However, its summary numbers do not consistently describe their underlying data:

- “Waiting on you” showed 3 while “Needs attention” contained 4 negotiation items, without explaining why the counts differed.
- “Owed to creators” included a $2,900 pending, unearned payment while the supporting text said there was nothing to approve.
- “Avg closed CPM” showed $36.25, while Benchmarks showed an actual CPM of $32.22 for the same completed record. The dashboard value appeared to use expected reach rather than actual views.

**Improvement**

Split payment exposure into committed, earned/ready, approved, and paid. Label forecast and actual performance explicitly, and make the dashboard and Benchmarks use the same definitions.

### 2. Configure the playbook

**What was tested**

- Reviewed commercial defaults, product cost, rights, minimum deliverables, commission, and tier fields.
- Saved the playbook and confirmed existing analyses became stale.

**Result: Passed with friction**

The page is long but the section navigation helps. The stale-analysis warning correctly communicates that a policy change can affect recommendations.

The standard offer exposes percentage commission, per-order commission, and per-order tiers at the same time. It is not clear which rule wins. That ambiguity later caused a real cost-calculation problem in Actuals.

**Improvement**

Require one explicit commission mode per deal: none, percentage of revenue, or amount per order. Show tiers only for the per-order mode and preview the exact formula before saving.

### 3. Capture a lightweight lead

**What was tested**

- Used the lead-specific new-record flow.
- Entered only a creator name and created the record without running analysis.

**Result: Passed with friction**

The record was created in Lead and the task was quick. However, a nearly empty lead displayed economics such as “Fee covers 3 pieces” and “Total deal cost $70,” inherited from playbook minimums and product cost even though no deliverables or offer existed.

**Improvement**

Hide deal economics until the relevant inputs exist, or label them as “playbook defaults—not yet proposed.”

### 4. Create a fully described deal

**What was tested**

- Entered creator details, YouTube and Instagram, channel metrics, campaign context, deliverables, opening message, 8% commission, 15% discount, usage rights, whitelisting, and category exclusivity.
- Confirmed the earlier no-key fallback, then repeated the flow with the configured provider.
- Uploaded a one-page synthetic YouTube analytics report containing reach, engagement, geography, audience-quality, trend, and rate data.

**Result: Issue**

The form is comprehensive and understandable. The visible file control accepted the PDF, extraction completed, and the app accurately recovered 128,400 average views, 5.8% engagement, 80% US/UK audience, 4% suspected fake followers, +12% trend, and a $4,500 ask. The missing-key state also remained clear and did not prevent manual deal creation.

The mixed-platform calculation was incorrect. Although YouTube and Instagram were selected, the saved deal rendered Instagram as its primary platform. It then applied the Instagram short-form CPM to both deliverables and reused the YouTube report's reach for both. The AI analysis noticed that the report was YouTube data while the deal was priced as Instagram, but the four commercial numbers still used the mismatched inputs.

Paid usage and exclusivity were also captured but excluded from the four-number guardrails. The interface described those rights as being charged “on top,” while the computed anchor, target, walkaway, and breakeven did not contain their value. That makes the numbers unsafe as hard negotiation limits.

The empty analysis copy refers to “your three numbers,” but the product presents four: anchor, target, walkaway, and breakeven.

**Improvement**

Price every deliverable with its own platform, format, and platform-specific reach source. Do not reuse a report metric across platforms unless the manager explicitly confirms that mapping. Include usage, whitelisting, and exclusivity in the displayed guardrails, or label them as excluded and prevent the app from describing the result as a complete deal price.

### 5. Use pipeline-stage quick add

**What was tested**

- Opened the add-record links rendered for several pipeline columns.
- Created a record from the Agreed-column shortcut.

**Result: Issue**

The page still displayed the standard “New deal” experience and “Create deal & run analysis.” The resulting record was created in the analysis/review stage rather than Agreed. Stage shortcuts for unsupported stages therefore promise an outcome they do not deliver.

**Improvement**

Only show shortcuts for stages the intake flow can safely create, or provide a stage-aware form that collects the minimum data required for the requested stage and confirms the resulting state.

### 6. Review and refresh the deal analysis

**What was tested**

- Inspected an existing completed analysis with verdict, risks, negotiation guidance, and commercial numbers.
- Changed playbook settings and reviewed the stale-analysis state.
- Corrected audience metrics and confirmed pricing updated.
- Ran a full configured-provider analysis on the uploaded synthetic report.

**Result: Passed with friction**

The analysis is one of the clearest parts of the product. The manager can see the recommendation, why it was made, and the boundaries for negotiation. Audience corrections update the commercial math immediately. The live analysis also correctly surfaced the report/platform mismatch, missing channel URL, self-reported evidence, scope ambiguity, and the fact that rights were not represented in the computed price.

The run took approximately 80 seconds. The phased progress display and “you can leave this page” guidance made that wait understandable.

The stale state renders two nearby “Re-run analysis” actions, adding unnecessary duplication. The “three numbers” copy is also inconsistent with the four-number model.

**Improvement**

Keep one primary refresh action and standardize the four-number terminology throughout the product.

### 7. Record replies and negotiate

**What was tested**

- Added an incoming creator reply.
- Confirmed the deal moved to Negotiating, Round 1.
- Reviewed the no-key recommendation fallback.
- Generated a full recommendation and reply draft with the configured provider.
- Declined the deal with a reason and note, then reopened it.

**Result: Passed with friction**

Conversation history, round tracking, decline context, and reopening all worked. The missing-AI state remained understandable and did not lose the incoming message. The configured-provider run produced a clear recommendation, a proposed offer inside the guardrail, useful reasoning, and an editable reply draft in approximately 63 seconds.

The draft promised an expected 77 orders and about $3,082 commission even though the underlying analysis had already identified a report/platform mismatch. Quantitative promises should not be copied into creator-facing text when their source is missing, mismatched, or low-confidence. After the recommendation completed, the pipeline card also continued to say “Copilot drafting…,” leaving stale progress state visible.

On a declined deal, the reply box and “Send to Copilot” action remain visible even though the server rejects negotiation actions for closed states. The interface invites an action that cannot succeed.

**Improvement**

Replace negotiation controls with a clear closed-state summary and one Reopen action. Restore the controls only after reopening. Treat material evidence warnings as blockers for externally facing quantitative claims, and clear all drafting progress labels on success or failure.

### 7a. Create a dated reminder

**What was tested**

- Opened the in-deal reminder form.
- Entered a reminder title and attempted to set 25 August 2026 through the browser's native date control using pointer and keyboard interactions.

**Result: Coverage gap**

The date appeared visually during one automated fill attempt, but the submitted action received an empty date and returned “Pick a date.” Repeated native pointer and segmented-keyboard attempts did not produce a valid submitted value in the in-app browser. This can be a browser-control limitation, so it is not classified as a confirmed product defect.

The date control does lack an accessible label, which makes both assistive use and reliable browser regression testing harder.

**Improvement**

Add a visible date label and an automated test that uses the real supported browser date control, submits the reminder, and verifies it appears on the intended date.

### 8. Mark the deal agreed

**What was tested**

- Looked for an agreement action inside the deal.
- Attempted two full pointer drags from the Negotiating card to the Agreed column at a wide desktop viewport.

**Result: Issue**

Agreement is available through drag-and-drop on the pipeline, but there is no explicit “Mark agreed” action inside the deal. Neither simulated pointer drag changed the stage and the interface showed no success or failure feedback. Native drag behavior can differ in an automated in-app browser, so a short manual browser check is still needed before classifying the drag implementation itself as broken. The test record was seeded directly into Agreed solely to continue the downstream audit.

Drag-only stage changes are difficult on mobile and can be inaccessible to keyboard users. A manager working inside the deal must leave the context to perform a critical transition.

**Improvement**

Add explicit, permission-aware stage actions in the deal workspace, including Mark agreed and Reopen completed. Keep drag-and-drop as a convenience, not the only path.

### 9. Generate and confirm the contract

**What was tested**

- Generated a deterministic contract from the agreed commercial terms.
- Edited and saved the draft.
- Marked it signed and confirmed the draft became read-only.
- Uploaded a separate one-page synthetic signed-source PDF and ran configured-provider parsing.
- Reviewed and confirmed the extracted source before generating fulfillment work.

**Result: Passed with friction**

The generated text correctly reflected the fee, deliverables, usage rights, whitelisting, and exclusivity. Draft saving and signed-state protection were clear. The signed-source upload, parsing, review, and confirmation path also worked end to end. It extracted two platform-specific deliverables, two $1,600 payments with different triggers, $119 product delivery, three months of usage, one month of exclusivity, Net-30 terms, and supporting notes. Confirmation created two correctly attributed content items, two trigger-aware payments, one shipment, and onboarding work.

There are three workflow disconnects:

- The header included a $70 product cost even though the generated contract did not mention gifted product and the delivery section said “No product to send.”
- Marking the generated contract signed does not create the fulfillment plan. The manager must still upload and parse the signed original, confirm its structure, and then create content, payment, and shipment records.
- The confirmation instructions say to upload the signed original “above,” but the upload control is rendered below.
- The source said the YouTube deliverable was due on 15 September, or 14 days after delivery if delivery happened after 1 September. Parsing preserved both an absolute date and the relative rule, but downstream date resolution only replaces a missing date. If delivery is late, the stored 15 September date therefore cannot move to the contractually correct later date.

**Improvement**

Treat the agreed terms as a provisional fulfillment plan. Let signed-document confirmation validate or adjust that plan instead of requiring the manager to rebuild it. Only include product cost when product is actually part of the deal, and align the generated contract with that decision. Represent conditional dates as a rule with a resolved date, not as two competing due-date fields; recalculate the resolved date when the delivery event occurs.

### 10. Complete onboarding

**What was tested**

- Started onboarding and confirmed four tasks were created.
- Added a tracking link and coupon code.
- Marked registration complete.
- Generated the welcome email, then separately marked its task complete.
- Checked program-level tasks on the partner profile.

**Result: Passed with friction**

The task checklist is easy to follow. Generating an email does not falsely complete the task, and program-level information appears on the partner while deal-specific coupon data stays with the deal.

The generated welcome email said “The campaign brief is attached” when the deal only contained free-text campaign context and no configured brief. Its footer then told the manager to attach the brief manually. This is contradictory and could send inaccurate instructions to a creator.

**Improvement**

Make generated-message claims conditional on real app state. If no brief file or configured brief exists, provide a neutral summary or a clear placeholder for the manager.

### 11. Create and manage content work

**What was tested**

- Added a content item manually on a YouTube and Instagram deal.
- Started production, added a draft link, requested changes, generated a revision message, resubmitted, approved, and marked the item posted.
- Checked the content board and platform filter throughout the process.

**Result: Issue**

The status sequence is clear and the revision loop preserves progress. Invalid draft and live links are rejected by the server, and the state-aware nudge copy is useful.

The manual content form asks only for title and due date. It created an item with no platform, causing two problems:

- The item disappeared when the YouTube filter was selected.
- Benchmark logic later attributed it to the first deal platform, YouTube, even though it could have been Instagram.

The content board warns that the item is invisible to platform filters, but the manager cannot repair the platform there. The due-date input also lacks an accessible label. URL buttons become enabled for malformed non-empty text and only fail after submission.

**Improvement**

Require a platform when a deal contains multiple platforms, allow it to be corrected, and use the selected platform consistently in filters and benchmarks. Add client-side URL feedback and a visible due-date label.

### 12. Use the creator portal

**What was tested**

- Opened the public portal.
- Saved legal/contact and delivery details.
- Submitted an invalid draft URL, then a valid one.
- Confirmed the manager dashboard and content queue updated immediately.

**Result: Passed**

The portal is simple, requires no creator account, explains the current state, and provides understandable validation. A valid creator submission immediately became a manager review action. This is a strong automation boundary: the creator supplies structured information and the manager receives a ready task.

### 13. Verify posted content

**What was tested**

- Posted a content URL.
- Marked it verified on a deal with no configured campaign brief.
- Confirmed the related payment advanced to Ready to approve.
- Uploaded a synthetic HTML campaign brief and extracted its requirements with the configured provider.
- Uploaded synthetic M4A audio and MP4 video containing compliant statements plus one prohibited claim.
- Attempted to upload a PNG visual through the integration-check media control.

**Result: Passed**

Verification correctly unlocked payment readiness, connecting delivery proof to the finance workflow.

Brief extraction worked well. It identified a 60-second minimum, four transcript-checkable requirements, and three visual or publishing requirements that could not be checked from a transcript. The review screen separated the two groups and let the manager edit the extracted requirements before activation.

Both audio and video checks completed against the active brief. Each correctly found the brand name, portable-WiFi description, and up-front sponsorship disclosure; it also caught the prohibited “unlimited lifetime data” claim with timestamped evidence. The result stayed manager-gated and did not auto-verify the content, which is the right approval boundary.

The audio run kept the page in a generic “Checking…” state for approximately 77 seconds, with no phase detail or leave-page/recovery guidance. The same short fixture completed as video in approximately 17 seconds, demonstrating high and unpredictable latency. A visual PNG was rejected because the control only accepts video or audio, so logo placement, product visibility, overlays, and static-story requirements remain outside the automated check.

**Improvement**

Run media checks as persisted background jobs with distinct uploading, transcribing, and evaluating phases; allow navigation, reload, retry, and failure recovery. Add image/frame analysis for visual requirements while retaining a human checklist for publishing obligations such as description links and pinned comments.

### 14. Approve and record payment

**What was tested**

- Created a $2,900 payment triggered by verified content.
- Observed Pending, Ready to approve, Approved, and Paid states.
- Filtered paid records and exported CSV.

**Result: Passed**

The state model is clear, payment did not become actionable before the deliverable was verified, and the queue reflected changes immediately. CSV export preserved the active status filter and triggered a download.

The dashboard payment summary remains misleading because it calls pending, unearned commitments “owed.” That is a reporting issue rather than a failure of the payment workflow itself.

### 15. Collect a shipping address and deliver product

**What was tested**

- Added a product shipment.
- Generated the public address form and submitted recipient, address, and phone details.
- Confirmed the manager view updated immediately.
- Marked the shipment shipped with blank carrier and tracking fields, then delivered.

**Result: Issue**

The public address form is clear and removes manual copying. The shipped transition is unsafe: the app accepts blank carrier and tracking data, then hides those inputs after the state change. The manager cannot add the missing tracking information through the interface.

**Improvement**

Require carrier and tracking number before shipment, with an explicit “no tracking available” exception when needed. Keep shipment details editable after dispatch and record the edit history.

### 16. Log results and review profitability

**What was tested**

- Logged 90,000 views, 4,200 clicks, 120 orders, and $9,600 revenue.
- Reviewed CPM, ROAS, true cost, provisional status, and Benchmarks.

**Result: Issue**

The 14-day provisional label is clear, and provisional results were correctly excluded from benchmark averages. The financial calculations were not consistent with the agreed deal:

- The deal specified 8% commission.
- Actuals applied the playbook’s $40-per-order tier at 120 orders, resulting in $4,800 commission.
- An 8% revenue commission on $9,600 would be $768.
- “True cost” became $7,770: $2,900 fee + $4,800 commission + $70 product.
- ROAS remained 3.31x, calculated from revenue divided by the $2,900 fee.
- Using the displayed true cost, all-in ROAS would be approximately 1.24x.

This is the most serious issue in the audit because it can change profitability, negotiation strategy, and partner ranking.

**Improvement**

Create one shared financial-calculation service used by the deal header, Actuals, Dashboard, and Benchmarks. It must preserve the deal’s agreed commission mode and label fixed-fee and all-in performance separately if both are useful.

### 17. Complete the deal

**What was tested**

- Attempted completion with no tracked work.
- Completed content verification, payment, and shipment.
- Marked the deal completed and reviewed the resulting workspace.

**Result: Passed with friction**

The completion guard worked: the action stayed disabled until tracked work existed and was finished. After completion, core fulfillment blocks were collapsed/read-only while Actuals remained editable, which is useful for late performance updates.

The read-only boundary is inconsistent. Contract upload, audience correction, rights, and notes remain editable, while other parts are locked. The contract uploader can still be used even though downstream confirmation rejects a completed deal. There is also no explicit Reopen action inside the completed deal.

**Improvement**

Define which completed-deal fields remain editable and explain why. Hide actions that the server will reject, and provide an audited Reopen action for legitimate corrections.

### 18. Reuse the creator record for a repeat deal

**What was tested**

- Reviewed the partner table and profile after completion.
- Started a new deal from the partner profile.
- Checked creator name, email, platforms, channel URL, audience, and engagement before and after interacting with the name field.

**Result: Issue**

The partner profile successfully consolidated deal history, channels, program setup, portal link, legal/contact information, and performance. The new-deal form did not prefill that data on initial load. It initially showed only the name and partner identifier. Platforms, URL, audience, and engagement appeared only after the name field lost focus, while email remained empty.

**Improvement**

Prefill all known creator information immediately when the page opens from a partner profile. Show which values came from the profile and allow the manager to update them for the new deal.

### 19. Check cross-deal queues and benchmarks

**What was tested**

- Reviewed Pipeline board/list, Content, Payments, Partners, Benchmarks, and Settings.
- Checked whether changes propagated between creator portal, deal workspace, and queues.

**Result: Passed with friction**

Cross-screen propagation is generally strong: creator submissions, payment status, partner history, and provisional benchmark status updated as expected. Settings clearly reports model configuration, API-key state, database count, currency, and usage cost.

The global views inherit the financial and platform-data issues described above. Their reliability depends on correcting those shared definitions rather than adding more dashboard widgets.

### 20. Use the app on a narrow mobile viewport

**What was tested**

- Used a 390 × 844 viewport on Dashboard, New Deal, Creator Portal, and a populated Fulfillment workspace.
- Checked navigation access and horizontal overflow.

**Result: Issue**

Dashboard, New Deal, and the Portal fit the viewport, and the mobile menu exposes the main navigation, budget, and new-deal action. A populated Fulfillment workspace overflowed horizontally: the main content was 390 px wide but contained a roughly 510 px layout, with the shipment row and paperwork controls extending off-screen.

**Improvement**

Stack fulfillment controls at narrow widths, allow long links and identifiers to wrap, and make action rows responsive. Treat 390 px without page-level horizontal scrolling as a release acceptance check.

## Fix implementation progress

**Implemented after this audit (18 August 2026)**

| Audit item | What changed | Verification |
| --- | --- | --- |
| PRICE-01 | Multi-platform pricing now maps the uploaded report and deal-level audience fields to one manager-selected platform. Platform-qualified quantities are priced once against each platform's own reach and CPM; missing reach is excluded and named in the workings. | Regression tests cover the audited 128,400-view YouTube report with missing Instagram evidence and a 1 YouTube + 2 Instagram bundle. Browser smoke test confirmed the new report-platform selector. |
| PRICE-02 | The Playbook now has machine-readable monthly uplifts for organic/paid usage, whitelisting, category exclusivity and full exclusivity, plus a cap. Fair value, anchor, target and walk-away include the resulting premium and show its arithmetic; breakeven remains the profitability ceiling and is compared against the full proposed fee. | Regression test confirms three months of paid usage plus one month of category exclusivity changes fair value, anchor, target and walk-away. Browser smoke test confirmed all six controls. |
| FIN-01 | The standard offer now chooses one explicit commission model and rejects ambiguous saves. Percentage commission is always settled as a percentage and is never replaced by dollar-per-order tiers; actual percentage payout uses attributed revenue, while per-order deals continue to use actual-order tier volume. | The audited 8% / 120-order / $9,600-revenue case produces $768 commission even with tiers present. Browser smoke confirmed the single commission-model control and its model-specific rate field. |
| FIN-02 | Financial helpers now centralize actual deal cost and named ROAS bases. Actuals shows Fee ROAS beside All-in ROAS with explanatory denominator copy; Benchmarks explicitly labels its fee-only figure instead of presenting an unspecified “ROAS”. | The audited $2,900 fee plus $768 commission and $70 product produces $3,738 all-in cost, 3.31× Fee ROAS and 2.57× All-in ROAS. |
| CNT-01 | Manual and contract-derived content on multi-platform deals must name a platform belonging to the deal. Existing items expose a repair selector; Actuals and Benchmarks exclude unresolved mixed-platform items rather than assigning them to the first platform. | Server validation and regression tests cover required membership, repair, and benchmark exclusion. |
| AI-01 | Analysis now records evidence confidence and notes. Mixed or insufficient evidence removes forecast figures from the recommendation prompt, and a post-generation guard rejects projected orders, views, total commission, revenue or ROI in creator-facing drafts. | Tests cover both structured confidence and legacy report/platform mismatch flags, including the audited “77 orders / $3,082 commission” failure. |
| AI-02 | Every successful recommendation, not only an opening offer, replaces the temporary “Copilot drafting…” label with a completed round status. | Regression test covers opening and later-round labels. |
| CONTRACT-02 | Content now retains an absolute anchor, a delivery offset and an explicit fixed/after-delivery/later-of/earlier-of mode. Delivery resolves the operational date without losing the original rule. | Regression test confirms that 5 September delivery plus 14 days moves the audited 15 September deadline to 19 September. Production build applies the schema migration. |
| PIPE-01 / PIPE-02 | Unsupported add shortcuts are hidden for Offer Sent, Negotiating, Agreed and Completed. Active deals now have a two-step Mark agreed action inside the workspace, so Kanban dragging is optional. | Browser smoke test confirmed shortcuts only for Lead, Contacted and To review, plus Mark agreed inside an active deal. |
| ACCESS-01 / REM-01 (partial) | Reminder title and native date controls now have visible accessible labels and wrap on narrow layouts. | Browser accessibility snapshot exposes “Reminder” and “Due date”. Native date submission still needs the physical-browser check described below. |
| OPS-01 / CONTRACT-01 (partial) | Marking a deal agreed now seeds reusable onboarding, creates an editable deterministic contract draft, and derives provisional content only when scope attribution is safe. Missing confirmed source, content plan, or payment schedule is consolidated into one Dashboard exception. Payment and product terms are deliberately not inferred, so signed-source confirmation is still authoritative for those records. | Isolated browser walkthrough turned “1 YouTube integration + 2 YouTube Shorts” into three correctly named items, an editable draft and four onboarding steps; Dashboard named the remaining contract/payment gaps. Parser tests cover ambiguous multi-platform refusal. |
| SHIP-01 | A shipment can move only To prepare → Shipped → Delivered. Shipped requires carrier plus tracking or a written tracking exception, and all four shipment fields remain visible and editable after dispatch. | Rule tests cover valid, invalid and skipped transitions. Isolated browser walkthrough showed the inline blocker, then accepted a documented hand-delivery exception. |
| PARTNER-01 | Starting a deal from a partner now renders known name, email, platforms, primary channel URL, views and engagement immediately. Partner profiles add published/verified counts, on-time percentage and average draft rounds. | Browser walkthrough opened `/new?partner=66` and found the profile values and delivery summary before any interaction; operational-stat unit tests pass. |
| PORTAL-01 | A creator can propose a publication date with a reason. It enters the manager's Content queue and Fulfillment approval controls without changing the real deadline; approval stores an override and rejection keeps the current date. | Isolated creator-to-manager walkthrough confirmed the pending state, Dashboard item and approval result (`draft due 2026-09-05 · publishes 2026-09-15`). |
| MOBILE-01 | Shipment fields now use a labelled responsive grid and fulfillment actions wrap on narrow screens. | A populated agreement, content plan and shipment measured 390 px document width at a 390 px viewport; the creator portal did the same. |
| APPROVAL-01 | A dedicated Approvals workspace now separates manager decisions from creator chases. It derives submitted drafts, date requests, contract review and rights mismatches, ready payments, setup gaps and completion decisions from the source records, with group/creator filters and exact Fulfillment anchors. | Seven rule tests cover inclusion, deduplication, severity, completion and counts. An isolated six-decision browser walkthrough verified filtering, exact draft anchoring, live queue removal after approval, and a 390 px layout with no horizontal overflow. |

All 477 automated tests, lint and the optimized production build pass. The isolated
browser walkthrough covered the agreement hand-off, setup exception, creator date
approval, shipment guard and unified approval queue without changing the working database. The configured
external AI was not called again during the fix pass; prompt/output safety is covered
deterministically, and a later provider regression run can verify prose quality without
being required for arithmetic correctness.

## Original prioritized improvement backlog

This list is retained for audit traceability. Items shown as implemented in the progress
table above are no longer open; the active forward plan is maintained in
`docs/AUTOMATION-ROADMAP.md`.

### P0 — Correctness before broader automation

| ID | Improvement | Acceptance check |
| --- | --- | --- |
| FIN-01 | Preserve the agreed commission model in Actuals and all summaries. | An 8% deal with $9,600 actual revenue records $768 commission even when per-order tiers exist in the playbook. A per-order deal still applies its valid tier. |
| FIN-02 | Define and centralize ROAS and cost calculations. | Deal header, Dashboard, and Benchmarks show matching values and labels. If fixed-fee and all-in ROAS both exist, each denominator is visible. |
| PRICE-01 | Make mixed-platform pricing platform- and evidence-aware. | A YouTube report's 128,400 average views is not silently reused for Instagram. Each deliverable uses its own platform, format, and confirmed reach source, and their components add up to the displayed deal value. |
| PRICE-02 | Include commercial rights in negotiation guardrails. | Three months of paid usage and one month of named-category exclusivity are included in fair value, anchor, target and walk-away. Breakeven remains the independent profitability ceiling, and every offer check compares the complete rights-inclusive fee against it. |
| CNT-01 | Require and preserve content platform attribution. | A manual item on a multi-platform deal cannot be saved without a platform; filters and benchmarks use that same platform; existing null items can be repaired. |

### P1 — Remove workflow breaks

| ID | Improvement | Acceptance check |
| --- | --- | --- |
| PIPE-01 | Fix or remove unsupported stage quick-add links. | Creating from an Agreed shortcut either produces a valid Agreed record with required setup or the shortcut is not offered. No silent fallback to Analysis occurs. |
| PIPE-02 | Add explicit in-deal stage actions. | A keyboard, touch, or mouse user can mark a deal agreed and reopen a completed deal without dragging a pipeline card. |
| SHIP-01 | Validate and preserve shipment details. | Shipped requires carrier and tracking or an explicit exception; details remain editable after dispatch. |
| PROD-01 | Connect gifted product across terms, cost, contract, and shipment. | Product cost appears only when product is part of the agreement; the contract and fulfillment plan reflect the same choice. |
| PARTNER-01 | Prefill repeat deals immediately. | Opening New Deal from a partner loads name, email, platforms, URLs, audience, and engagement before any field interaction. |
| MOBILE-01 | Make populated Fulfillment responsive. | At 390 px, the document width equals the viewport width and all controls remain visible and usable. |
| CAMPAIGN-01 | Make campaign-brief messaging state-aware. | Generated messages never say a brief is attached unless a real configured brief exists. |
| CONTRACT-01 | Reduce duplicate work between generated contract, signed source, and fulfillment. | Agreed terms seed a provisional work/payment/shipping plan; document confirmation validates or amends it instead of recreating it. |
| CONTRACT-02 | Preserve conditional contract deadlines as rules. | For “15 September, or 14 days after delivery if delivered after 1 September,” a 5 September delivery resolves to 19 September and every downstream view shows the updated date. |
| AI-01 | Prevent low-confidence evidence from becoming creator-facing promises. | If analysis flags a platform/source mismatch, a recommendation cannot quote orders, commission, reach, or ROI from that evidence until the manager confirms or corrects it. |
| AI-02 | Clear recommendation progress state reliably. | After every successful or failed recommendation, the deal and pipeline no longer show “Copilot drafting…” and instead show the completed result or actionable error. |
| MEDIA-02 | Make long media checks resumable background work. | During a 60–90 second check, the UI shows upload/transcription/evaluation phases; navigating or reloading does not lose the job or result; retry is available after failure. |
| KPI-01 | Clarify workload and financial dashboard cards. | “Owed” excludes unearned commitments or is renamed; forecast and actual CPM are visibly distinct; attention-count definitions are available. |

### P2 — Clarity and guardrails

| ID | Improvement | Acceptance check |
| --- | --- | --- |
| CLOSED-01 | Make closed-state controls consistent. | Declined/completed deals show no action that the server will reject; reopening restores applicable controls. |
| VALID-01 | Validate URLs before submission. | Draft and live-link actions remain disabled or show inline feedback until a valid HTTP(S) URL is entered. |
| ACCESS-01 | Improve form and stage accessibility. | Due-date fields have visible names; every stage transition works with keyboard and touch; action labels describe their result. |
| UI-01 | Remove duplicate stale-analysis actions. | One clear primary refresh action appears per stale analysis state. |
| COPY-01 | Correct inconsistent guidance. | The app consistently refers to four commercial numbers, points to controls in their actual location, and labels early economics as defaults. |
| REM-01 | Add regression coverage for reminders and date inputs. | A browser test creates a reminder with a real date and verifies it appears in the intended queue/state. |
| MEDIA-01 | Cover visual and non-transcript brief obligations. | Static images and sampled video frames can be checked for logo, product, text, and placement requirements; links, pinned comments, and other publishing obligations remain an explicit manager checklist. |

## Suggested implementation sequence

1. Centralize commission, cost, ROAS, platform-specific pricing, and rights valuation; add fixture-based financial tests.
2. Require platform attribution, map evidence per platform, and repair existing null-platform items.
3. Block AI drafts from repeating unconfirmed quantitative claims and fix stale progress state.
4. Fix stage actions, shipping validation, and closed-state dead ends.
5. Connect agreed terms to product, conditional contract dates, and provisional fulfillment records.
6. Move media evaluation to resumable jobs and add visual-requirement coverage.
7. Improve repeat-deal prefill and state-aware generated messages.
8. Resolve mobile fulfillment overflow and remaining labels/validation.

This sequence makes the existing automation trustworthy before expanding it. It also reduces the chance that future reporting or AI recommendations amplify incorrect commercial data.

## Regression walkthrough

Use the following short scenario after the priority fixes:

1. Create a returning creator with YouTube and Instagram, an 8% commission, gifted product, rights, and two platform-specific deliverables. Upload a different report for each platform.
2. Mark the deal agreed from inside the deal workspace using keyboard controls.
3. Confirm each deliverable uses only its own platform evidence and that rights are present in every displayed guardrail.
4. Generate the contract and confirm that fee, commission mode, product, rights, and conditional date rules match the provisional fulfillment plan.
5. Deliver the product after a conditional cutoff and confirm all content due dates resolve to the contractually correct later date.
6. Open the creator portal, submit address details and one draft per platform, and confirm both manager queues update.
7. Upload audio, video, and image fixtures; reload during one check and confirm results persist while visual and publishing obligations remain human-gated.
8. Request a revision on one item, approve both, publish, and verify them.
9. Confirm the payment becomes ready only after its trigger is satisfied.
10. Try to mark a shipment shipped without tracking; confirm validation prevents it. Add tracking, ship, and edit the carrier afterward.
11. Enter $9,600 revenue and confirm an 8% commission is $768 across the deal, Dashboard, and Benchmarks.
12. Confirm fixed-fee and all-in ROAS are either consistent or explicitly separated.
13. Complete the deal and confirm rejected actions are hidden while permitted Actuals edits remain available.
14. Start another deal from the partner and confirm all known profile data is present immediately.
15. Repeat the operational steps at 390 px and confirm there is no page-level horizontal scroll.

## Coverage notes

The follow-up pass completed report upload/parsing, signed-contract upload/parsing/source confirmation, campaign-brief extraction, audio/video integration checks, and full configured-provider analysis/recommendations. A static image was deliberately tried and confirmed unsupported by the current media control.

One interaction still needs a short manual browser confirmation:

- Reminder creation through the native date control, because the in-app browser submitted an empty value despite pointer and keyboard attempts

Kanban drag-and-drop itself was still not proven in the in-app browser, but it is no longer a workflow blocker because the same transition is now available as an explicit in-deal action.

The audit used isolated test records and non-production contact/address data. The working database was restored after the walkthrough so audit records do not remain in the app.
