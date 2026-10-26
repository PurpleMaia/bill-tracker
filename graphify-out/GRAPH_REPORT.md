# Graph Report - src  (2026-10-19)

## Corpus Check
- 433 files · ~196,373 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .htm 5, .ico 1, .css 1)

## Summary
- 2052 nodes · 7036 edges · 154 communities (89 shown, 65 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 87 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Legislators & Committee Contacts
- OAuth Provider Callbacks
- Password & Verification Emails
- Loading States & Bulk Assign
- Bill Detail & Tags API
- Kanban Column Options
- Testimony Export & Preview
- Admin Dashboard
- Testimonies Pages
- Bill Status & Eligibility Logic
- Root Layout & Toasts
- Kanban Header & CSV Export
- shadcn Primitives
- Bill Mappers & Types
- Org Boards & Follows
- Testimony Listing Actions
- Discover & Search UI
- Kanban Card & Dead Bills
- Login & Registration API
- Bill Briefing & Details Dialog
- Bill Versions Panel
- Main Layout & Nav
- App URL & Email Utils
- Access Requests
- Status Proposals
- Access Request Buttons
- Auth Header & Menu
- Version Diff Engine
- AI Summaries
- Auth Guards & Context
- Register & Reset Pages
- Search Filter Rail
- Testimony Editor Page
- Version Compare & Editor
- Bill Reference & Committees
- Kanban Board & Columns
- Kysely Client & Retry
- Bills Read & Mapping
- Calendar View
- Summary Prompts
- Admin Server Actions
- Bill Tracking Actions
- Data-Client Transport
- User Preferences
- Bill Filters & Search
- Email Verify & Login Wall
- Menubar Primitive
- Admin & DB Types
- Invite Tokens API
- Bill Search Query
- Testimony Draft CRUD
- Boards Pages
- Form Primitive
- Version Diff Fixtures
- Your Bills Board
- CSV Export
- Testimony Submit Guide
- Learn Walkthrough
- Intern Selector & Buttons
- Auth Tables Migrations
- Multi-Tenancy Migration
- Toast Hook
- Bill HTML Cache
- Calendar Updates
- Browse Orgs
- Chart Primitive
- LLM Status Classifier
- Human Proposals & Permissions
- Board Bills & Follow
- Committee Names
- Settings & Diff Accordion
- Performance Indexes
- Org Stats & Lists
- user_bills Schema
- Tags Schema
- Spreadsheet Skeletons
- Pending Proposals Schema
- Committee Tables Schema
- Bill Assignment
- Alert Primitive
- Versions & Reports Schema
- Derived Status
- Tracked Bill IDs
- Filter Chips
- Bill Preferences Schema
- Invite Tokens Schema
- Bill Search Index
- Page Loading
- Supervisor Schema
- Testimonies Schema
- Password Reset Schema
- Bill Text Trigram Index
- Bills & Stats Schema
- Status Updates Schema
- Legislators Schema

## God Nodes (most connected - your core abstractions)
1. `cn()` - 242 edges
2. `Button` - 135 edges
3. `useAuth()` - 98 edges
4. `Badge()` - 48 edges
5. `Bill` - 48 edges
6. `BillDetailsDialog()` - 42 edges
7. `useToast()` - 42 edges
8. `useBills()` - 39 edges
9. `Label` - 38 edges
10. `getSessionCookie()` - 36 edges

## Surprising Connections (you probably didn't know these)
- `FilterChipsRowProps` --references--> `Tag`  [EXTRACTED]
  components/kanban/filter-chips-row.tsx → types/legislation.ts
- `KanbanBoardProps` --references--> `Bill`  [EXTRACTED]
  components/kanban/kanban-board.tsx → types/legislation.ts
- `GridSpreadsheetSkeleton()` --calls--> `cn()`  [EXTRACTED]
  components/kanban/skeletons/skeleton-spreadsheet.tsx → lib/core/utils.ts
- `TempBillCardProps` --references--> `TempBill`  [EXTRACTED]
  components/kanban/temp-card.tsx → types/legislation.ts
- `SearchFiltersSheetProps` --references--> `SearchFilters`  [EXTRACTED]
  components/search/search-filters-sheet.tsx → lib/bills/search-params.ts

## Import Cycles
- None detected.

## Communities (154 total, 65 thin omitted)

### Community 0 - "Legislators & Committee Contacts"
Cohesion: 0.06
Nodes (54): getCommitteeChairsAction(), getConfereesAction(), GET(), POST(), ChairCard(), chairKey(), CommitteeGroup, Compose() (+46 more)

### Community 1 - "OAuth Provider Callbacks"
Cohesion: 0.08
Nodes (38): GET(), GET(), AuthErrorCode, GET(), clearOAuthCookies(), failureRedirect(), resolveOAuthUser(), GET() (+30 more)

### Community 2 - "Password & Verification Emails"
Cohesion: 0.09
Nodes (35): FORGOT_PASSWORD_RATE_LIMIT, NEUTRAL_RESPONSE, POST(), getClientIp(), POST(), RESEND_RATE_LIMIT, GET(), POST() (+27 more)

### Community 3 - "Loading States & Bulk Assign"
Cohesion: 0.12
Nodes (28): AssignMultipleBillsDialog(), AssignMultipleBillsDialogProps, User, OrgSettingsDialog(), OrgSettingsDialogProps, AssignBillDialog(), BillBreakdownButton(), BillBreakdownFooter() (+20 more)

### Community 4 - "Bill Detail & Tags API"
Cohesion: 0.13
Nodes (33): POST(), DELETE(), PATCH(), GET(), GET(), POST(), DELETE(), GET() (+25 more)

### Community 5 - "Kanban Column Options"
Cohesion: 0.09
Nodes (31): BillReferencePanelProps, AssignBillDialogProps, ColumnOptionsMenu(), ColumnOptionsMenuProps, KanbanCardProps, KanbanColumnProps, LLMUpdateColumnButton(), Props (+23 more)

### Community 6 - "Testimony Export & Preview"
Cohesion: 0.09
Nodes (27): TestimonyExportStep(), TestimonyExportStepProps, TestimonyHeaderValue, TestimonyPreview(), TestimonyPreviewProps, blocksToPlainText(), composeHeaderLines(), listItemToItems() (+19 more)

### Community 7 - "Admin Dashboard"
Cohesion: 0.18
Nodes (34): AccountsTab(), AdminDashboard(), AllAccountsSection(), AllInternBillsTab(), AllInternsTab(), AllSupervisorsTab(), Invite, PendingInvitesSection() (+26 more)

### Community 8 - "Testimonies Pages"
Cohesion: 0.09
Nodes (34): TestimonyDraftsPage(), TestimoniesPage(), TestimonySubmittedPage(), FlatDeadline, flattenDeadlines(), GUIDE_STEPS, humanize(), TestimoniesSidebar() (+26 more)

### Community 9 - "Bill Status & Eligibility Logic"
Cohesion: 0.13
Nodes (35): BillStatus, BriefingStep, deriveBriefingFacts(), Chamber, DeadlineTier, ENACTED_STATUSES, findPermanentDeferral(), formatDeadlineStanding() (+27 more)

### Community 10 - "Root Layout & Toasts"
Cohesion: 0.09
Nodes (27): geistMono, geistSans, metadata, RootLayout(), Toast, ToastAction, ToastActionElement, ToastClose (+19 more)

### Community 11 - "Kanban Header & CSV Export"
Cohesion: 0.16
Nodes (26): ExportCsvDialog(), KanbanHeader(), KanbanHeaderProps, ViewScopeToggle(), MobileHamburgerMenu(), CardTagSelector(), CardTagSelectorProps, FilterOptionRow() (+18 more)

### Community 12 - "shadcn Primitives"
Cohesion: 0.09
Nodes (34): AvatarImage, CommandSeparator, CommandShortcut(), Separator, Sidebar, SidebarContent, SidebarContext, SidebarFooter (+26 more)

### Community 13 - "Bill Mappers & Types"
Cohesion: 0.06
Nodes (34): AdditionalBillData, AiMisclassification, AuthKey, BillTags, BillVersions, CommitteeChairs, CommitteeReports, Committees (+26 more)

### Community 14 - "Org Boards & Follows"
Cohesion: 0.11
Nodes (20): getOrgSettingsAction(), setOrgDescriptionAction(), setPublicBoardAction(), unfollowOrgAction(), DELETE(), getTenantSettings(), setPublicBoard(), setTenantDescription() (+12 more)

### Community 15 - "Testimony Listing Actions"
Cohesion: 0.12
Nodes (20): getTestimonyStatusesAction(), listTestimonyProspectsAction(), listUserTestimoniesAction(), GET(), GET(), GET(), DecoratedProspect, getTestimonyStatuses() (+12 more)

### Community 16 - "Discover & Search UI"
Cohesion: 0.10
Nodes (24): DiscoverPage(), metadata, ActiveFilterChips(), ActiveFilterChipsProps, Chip, BillSearchCard, BillSearchView(), SESSION_YEARS (+16 more)

### Community 17 - "Kanban Card & Dead Bills"
Cohesion: 0.13
Nodes (22): DeadBillInfoPopover(), DeadBillInfoPopoverProps, ChipTooltip(), KanbanCardComponent, BillSearchCardComponent(), highlight(), getStatusChipClasses(), getStatusPhase() (+14 more)

### Community 18 - "Login & Registration API"
Cohesion: 0.14
Nodes (24): getClientIp(), LOGIN_RATE_LIMIT, POST(), getClientIp(), POST(), REGISTER_RATE_LIMIT, GET(), POST() (+16 more)

### Community 19 - "Bill Briefing & Details Dialog"
Cohesion: 0.13
Nodes (20): BillBriefing(), STEP_ICON, BillDetailsDialog(), BillDetailsDialogProps, DialogTab, TABS, RefreshStatusesButton(), Progress (+12 more)

### Community 20 - "Bill Versions Panel"
Cohesion: 0.14
Nodes (24): BillVersionsPanel(), LinkButtons(), ReportRow(), State, SummaryCard(), SummarySection(), SummarySectionProps, VersionCompare() (+16 more)

### Community 21 - "Main Layout & Nav"
Cohesion: 0.13
Nodes (20): MainLayout(), AdminHeader(), AdminHeaderProps, ActiveBoardsSubNav(), isActiveBoardsTabActive(), TABS, BottomTabBar(), Header() (+12 more)

### Community 22 - "App URL & Email Utils"
Cohesion: 0.15
Nodes (24): appUrl(), getAppUrl(), button(), escapeHtml(), fallbackLink(), footnote(), logTokenUrlInDevOnly(), p() (+16 more)

### Community 23 - "Access Requests"
Cohesion: 0.12
Nodes (20): requestAdminAccessAction(), requestSupervisorAccessAction(), POST(), POST(), requestAdminAccess(), requestSupervisorAccess(), emailSchema, forgotPasswordSchema (+12 more)

### Community 24 - "Status Proposals"
Cohesion: 0.17
Nodes (22): createProposalAction(), CreateProposalParams, decideProposalAction(), DecideProposalParams, deleteProposalAction(), DeleteProposalParams, listProposalsAction(), DELETE() (+14 more)

### Community 25 - "Access Request Buttons"
Cohesion: 0.14
Nodes (21): RequestAdminAccessButton(), RequestAdminAccessButtonProps, RequestSupervisorAccessButton(), RequestSupervisorAccessButtonProps, GoogleMark(), GoogleSignInButton(), GoogleSignInButtonProps, LoginDialog() (+13 more)

### Community 26 - "Auth Header & Menu"
Cohesion: 0.14
Nodes (17): AUTH_ERROR_MESSAGES, AuthErrorToast(), AuthHeader(), UserMenu(), OrgSwitcherDropdown(), Avatar, AvatarFallback, DropdownMenuCheckboxItem (+9 more)

### Community 27 - "Version Diff Engine"
Cohesion: 0.11
Nodes (20): DiffSummaryState, Fragment(), FRAGMENT_CLASS, SECTION_BADGE, SR_LABEL, VersionDiffAccordionProps, BOILERPLATE_MARKERS, ChangeFragment (+12 more)

### Community 29 - "AI Summaries"
Cohesion: 0.15
Nodes (20): AI_NOT_OPTED_IN, requireAiOptIn(), summarizeDiffAction(), summarizeDocumentAction(), POST(), POST(), getBillCommittees(), getSummarySource() (+12 more)

### Community 30 - "Auth Guards & Context"
Cohesion: 0.16
Nodes (19): OrgRole, AuthContextType, assertAdmin(), AuthContext, OptionalAuthContext, userFromAction(), getInitialAuth(), InitialAuth (+11 more)

### Community 31 - "Register & Reset Pages"
Cohesion: 0.18
Nodes (17): RegisterForm(), RegisterPage(), ResetPasswordForm(), ResetPasswordPage(), Stage, CreateOrgDialog(), CreateOrgDialogProps, InviteUserDialog() (+9 more)

### Community 32 - "Search Filter Rail"
Cohesion: 0.15
Nodes (19): SearchFilterRail(), StageRow(), TRACKED_OPTIONS, TrackingRadioGroup(), YEARS, Checkbox, RadioGroup, RadioGroupItem (+11 more)

### Community 33 - "Testimony Editor Page"
Cohesion: 0.15
Nodes (18): EMPTY_DOC, SaveState, TestimonyPage(), SearchFiltersSheet(), SearchFiltersSheetProps, STEPS, TestimonyStep, TestimonyStepper() (+10 more)

### Community 34 - "Version Compare & Editor"
Cohesion: 0.16
Nodes (16): UserSelector(), ERROR_COPY, RETRYABLE, VersionPicker(), FONT_OPTIONS, HEADING_OPTIONS, MarkButton(), TestimonyEditor() (+8 more)

### Community 35 - "Bill Reference & Committees"
Cohesion: 0.20
Nodes (18): BillReferencePanel(), BillBreakdown(), CommitteeNamesContext, useCommitteeNames(), resolveCommitteeListTerm(), resolveCommitteeTerm(), resolveDeadlineTerm(), resolveStatusTerm() (+10 more)

### Community 36 - "Kanban Board & Columns"
Cohesion: 0.19
Nodes (16): KanbanBoardProps, KanbanCard, getColumnPhaseBg(), KanbanColumn, AWAITING_HEARING_STATUSES, COLUMN_DESCRIPTIONS, COLUMN_INDEX, COLUMN_TITLES (+8 more)

### Community 37 - "Kysely Client & Retry"
Cohesion: 0.11
Nodes (7): KyselySingleton, delay(), isRetryable(), RETRYABLE_ERRORS, RetryConnection, RetryDriver, RetryOptions

### Community 38 - "Bills Read & Mapping"
Cohesion: 0.20
Nodes (20): getBillsAction(), BillSearchCardProps, convertDataToBillShape(), mapBillDataToBillClient(), mapReportRow(), mapVersionRow(), findExistingBillByURL(), getAdditionalBillData() (+12 more)

### Community 39 - "Calendar View"
Cohesion: 0.20
Nodes (17): CalendarView(), dayKey(), DayPanel(), MilestoneRow(), WEEKDAYS, BillMilestone, classifyUpdate(), extractMilestones() (+9 more)

### Community 40 - "Summary Prompts"
Cohesion: 0.16
Nodes (15): buildDiffUserTurn(), buildDocumentUserTurn(), buildReportUserTurn(), DIFF_PROMPT_VERSION, DIFF_SYSTEM_PROMPT, DOCUMENT_SYSTEM_PROMPT, renderSection(), REPORT_PROMPT_VERSION (+7 more)

### Community 41 - "Admin Server Actions"
Cohesion: 0.28
Nodes (18): ActionResult, approveUser(), archiveAccount(), assignMultipleBillsToUsers(), assignSupervisorToIntern(), denyUser(), getAllAccounts(), getAllActiveUsers() (+10 more)

### Community 42 - "Bill Tracking Actions"
Cohesion: 0.16
Nodes (13): compareVersionsAction(), GetBillsParams, searchBillsAction(), trackBillByIdAction(), updateBillStatusAction(), UpdateBillStatusParams, POST(), getVersionHtmlLinks() (+5 more)

### Community 43 - "Data-Client Transport"
Cohesion: 0.13
Nodes (14): accessClient, billsClient, committeesClient, AnyAsyncFn, Client, defineClient(), Op, Ops (+6 more)

### Community 44 - "User Preferences"
Cohesion: 0.23
Nodes (10): getPreferencesAction(), updatePreferencesAction(), GET(), PATCH(), getUserPreferences(), updateUserPreferences(), applyPreferenceDefaults(), DEFAULT_PREFERENCES (+2 more)

### Community 45 - "Bill Filters & Search"
Cohesion: 0.19
Nodes (12): BillFilters, filterBills(), hasActiveFilters(), compact(), fuzzyWordMatch(), maxEditsFor(), normalize(), scoreToken() (+4 more)

### Community 46 - "Email Verify & Login Wall"
Cohesion: 0.38
Nodes (13): VerifyEmailContent(), VerifyEmailPage(), LoginWall(), LoginWallProps, BoardsLoginWall(), TempBillCard(), TempBillCardProps, Card (+5 more)

### Community 47 - "Menubar Primitive"
Cohesion: 0.11
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 48 - "Admin & DB Types"
Cohesion: 0.18
Nodes (16): UserSelectorProps, BillData, Bills, PendingProposals, SupervisorUsers, User, UserBills, AdoptedBill (+8 more)

### Community 49 - "Invite Tokens API"
Cohesion: 0.17
Nodes (4): db, pool, singleton, requireAdmin

### Community 50 - "Bill Search Query"
Cohesion: 0.28
Nodes (13): GET(), searchBills(), chamberPrefixes(), decodeCursor(), DEFAULT_FILTERS, encodeCursor(), filtersToQueryString(), isBillNumberQuery() (+5 more)

### Community 51 - "Testimony Draft CRUD"
Cohesion: 0.20
Nodes (14): deleteTestimonyAction(), getTestimonyDraftAction(), markTestimonySubmittedAction(), saveTestimonyDraftAction(), DELETE(), GET(), PATCH(), PUT() (+6 more)

### Community 52 - "Boards Pages"
Cohesion: 0.28
Nodes (9): BoardsLayout(), BoardsPage(), ActiveBoardIdentity(), ActiveBoardView(), ActiveBoardsBillsBridge(), ActiveBoardsContext, ActiveBoardsProvider(), useActiveBoards() (+1 more)

### Community 53 - "Form Primitive"
Cohesion: 0.17
Nodes (10): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+2 more)

### Community 54 - "Version Diff Fixtures"
Cohesion: 0.21
Nodes (7): FIXTURES, errorComparison(), compareVersionHtml(), DIFF_RATE_LIMIT, diffParsedHtml(), quietly(), sectionNumbersOf()

### Community 55 - "Your Bills Board"
Cohesion: 0.33
Nodes (10): YourBills(), KanbanBoard(), ProtectedKanbanBoardOrSpreadsheet(), KanbanBoardSkeleton(), KanbanCardSkeleton(), KanbanColumnSkeleton(), PHASE_BGS, KanbanBoardContext (+2 more)

### Community 56 - "CSV Export"
Cohesion: 0.23
Nodes (9): downloadBlob(), ExportCsvDialogProps, RFC-4180, billsToCsv(), billsToRows(), cellValue(), escapeCsvField(), EXPORT_COLUMNS (+1 more)

### Community 57 - "Testimony Submit Guide"
Cohesion: 0.24
Nodes (12): STEPS, TestimonySubmitGuide(), TestimonySubmitGuideProps, getSnapshot(), invalidateTestimonies(), listeners, loadFor(), setState() (+4 more)

### Community 58 - "Learn Walkthrough"
Cohesion: 0.24
Nodes (10): LearnPage(), metadata, LearnWalkthrough(), BillStanding, chamberName(), CONFERENCE_STATUSES, currentChamberPhrase(), deriveBillStanding() (+2 more)

### Community 59 - "Intern Selector & Buttons"
Cohesion: 0.17
Nodes (7): InternOption, InternSelector(), InternSelectorProps, PlaceholderPageProps, buttonVariants, Calendar(), CalendarProps

### Community 60 - "Auth Tables Migrations"
Cohesion: 0.19
Nodes (9): "auth_key", "sessions", "user", idx_user_verification_token, idx_user_auth_provider, idx_user_google_id, idx_user_account_status, idx_user_email (+1 more)

### Community 61 - "Multi-Tenancy Migration"
Cohesion: 0.24
Nodes (10): idx_members_tenant_id, idx_members_user_id, idx_org_bills_bill_id, idx_org_bills_tenant_id, members, org_bills, tenants, idx_members_tenant_user (+2 more)

### Community 62 - "Toast Hook"
Cohesion: 0.19
Nodes (12): Action, ActionType, actionTypes, addToRemoveQueue(), dispatch(), genId(), listeners, memoryState (+4 more)

### Community 63 - "Bill HTML Cache"
Cohesion: 0.24
Nodes (9): calls, DiffError, billHtmlCacheSize(), BillHtmlError, cache, cacheGet(), cacheSet(), clearBillHtmlCache() (+1 more)

### Community 64 - "Calendar Updates"
Cohesion: 0.33
Nodes (7): getCalendarUpdatesAction(), POST(), getStatusUpdatesForBills(), MAX_CALENDAR_BILL_IDS, normalizeCalendarBillIds(), MilestoneUpdate, calendarClient

### Community 65 - "Browse Orgs"
Cohesion: 0.32
Nodes (10): BrowseOrgsPage(), BrowseIntro(), BrowseOrgsList(), BrowseSkeleton(), FollowedOrgs(), MyOrgCard(), OrgCard(), OrgCardSkeleton() (+2 more)

### Community 66 - "Chart Primitive"
Cohesion: 0.24
Nodes (10): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartStyle(), ChartTooltipContent, getPayloadConfigFromPayload() (+2 more)

### Community 67 - "LLM Status Classifier"
Cohesion: 0.23
Nodes (10): classifyStatusWithLLM(), client, detectCrossover(), enforceForwardProgression(), getContext(), LLM_RATE_LIMIT, mapToColumnID(), SUMMARY_RATE_LIMIT (+2 more)

### Community 68 - "Human Proposals & Permissions"
Cohesion: 0.29
Nodes (8): ActiveTenant, ProposeStatusChange, SessionUser, useHumanProposals(), canAssignBills(), canCommitStatus(), canTrackOwnBills(), getAssignableRoles()

### Community 69 - "Board Bills & Follow"
Cohesion: 0.33
Nodes (9): followOrgAction(), getBoardAction(), getOrgTestimonyStatusAction(), POST(), GET(), getAllTrackedBills(), followOrg(), getPublicTenant() (+1 more)

### Community 70 - "Committee Names"
Cohesion: 0.40
Nodes (5): getCommitteeNamesAction(), GET(), CommitteeNameMap, getCommitteeNames(), optionalSession

### Community 71 - "Settings & Diff Accordion"
Cohesion: 0.38
Nodes (7): VersionDiffAccordion(), summarizeDiff(), SettingsDialog(), SettingsDialogProps, AccordionContent, AccordionItem, AccordionTrigger

### Community 72 - "Performance Indexes"
Cohesion: 0.29
Nodes (7): idx_bills_archived, idx_bills_bill_status, idx_bills_dead, idx_bills_food_related, idx_bills_year, idx_sessions_session_token, idx_status_updates_bill_id

### Community 73 - "Org Stats & Lists"
Cohesion: 0.33
Nodes (8): getMyOrgStatsAction(), listFollowedOrgsAction(), listPublicOrgsAction(), GET(), getMyOrgStats(), getSampleBillsForTenants(), listFollowedTenants(), listPublicTenants()

### Community 74 - "user_bills Schema"
Cohesion: 0.25
Nodes (7): "user_bills", idx_user_bills_tenant_id, idx_user_bills_bill_id, idx_user_bills_tenant_user, idx_user_bills_user_id, user_bills_user_bill_personal_uniq, user_bills_user_bill_tenant_uniq

### Community 75 - "Tags Schema"
Cohesion: 0.39
Nodes (6): bill_tags, idx_bill_tags_bill_id, idx_bill_tags_tag_id, idx_tags_name, tags, idx_tags_tenant_id

### Community 76 - "Spreadsheet Skeletons"
Cohesion: 0.38
Nodes (6): CompactSpreadsheetSkeleton(), GridSpreadsheetSkeleton(), SpreadsheetCellSkeleton(), SpreadsheetCellSkeletonProps, SpreadsheetSkeleton(), SpreadsheetSkeletonProps

### Community 77 - "Pending Proposals Schema"
Cohesion: 0.43
Nodes (5): idx_pending_proposals_approval_status, idx_pending_proposals_bill_id, idx_pending_proposals_proposed_by_user_id, pending_proposals, idx_pending_proposals_tenant_id

### Community 78 - "Committee Tables Schema"
Cohesion: 0.48
Nodes (5): committee_chairs, committee_chairs_active_unique, committee_chairs_committee_id_idx, committee_chairs_legislator_id_idx, committees

### Community 79 - "Bill Assignment"
Cohesion: 0.62
Nodes (5): assignBill(), unassignBillFromUser(), validateAssignmentScope(), untrackBill(), useTrackedBills()

### Community 80 - "Alert Primitive"
Cohesion: 0.40
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 81 - "Versions & Reports Schema"
Cohesion: 0.53
Nodes (4): bill_versions, committee_reports, idx_bill_versions_bill_id, idx_committee_reports_bill_id

### Community 82 - "Derived Status"
Cohesion: 0.53
Nodes (3): recomputeDerivedStatus(), deriveBillStatus(), EXTENDED_INDEX

### Community 83 - "Tracked Bill IDs"
Cohesion: 0.50
Nodes (4): getMyTrackedBillIdsAction(), GET(), getUserTrackedBillIds(), requireSession

### Community 84 - "Filter Chips"
Cohesion: 0.60
Nodes (4): Chip(), FilterChipsRow(), FilterChipsRowProps, badgeVariants

### Community 85 - "Bill Preferences Schema"
Cohesion: 0.60
Nodes (3): idx_user_bill_preferences_bill_id, idx_user_bill_preferences_user_id, user_bill_preferences

### Community 86 - "Invite Tokens Schema"
Cohesion: 0.70
Nodes (4): idx_invite_tokens_email_tenant, idx_invite_tokens_tenant_id, idx_invite_tokens_token, invite_tokens

### Community 87 - "Bill Search Index"
Cohesion: 0.60
Nodes (3): bills_browse_idx, bills_number_trgm_idx, bills_search_vector_idx

### Community 89 - "Supervisor Schema"
Cohesion: 0.83
Nodes (3): idx_supervisor_users_supervisor, idx_supervisor_users_user, supervisor_users

### Community 91 - "Password Reset Schema"
Cohesion: 0.83
Nodes (3): idx_password_reset_tokens_expires_at, idx_password_reset_tokens_user_id, password_reset_tokens

## Knowledge Gaps
- **1 isolated node(s):** `RFC-4180`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 501 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **65 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `shadcn Primitives` to `Legislators & Committee Contacts`, `Loading States & Bulk Assign`, `Testimony Export & Preview`, `Admin Dashboard`, `Testimonies Pages`, `Root Layout & Toasts`, `Kanban Header & CSV Export`, `Kanban Card & Dead Bills`, `Bill Briefing & Details Dialog`, `Bill Versions Panel`, `Main Layout & Nav`, `Access Request Buttons`, `Auth Header & Menu`, `Version Diff Engine`, `Register & Reset Pages`, `Search Filter Rail`, `Testimony Editor Page`, `Version Compare & Editor`, `Bill Reference & Committees`, `Kanban Board & Columns`, `Calendar View`, `Email Verify & Login Wall`, `Menubar Primitive`, `Form Primitive`, `Your Bills Board`, `Learn Walkthrough`, `Intern Selector & Buttons`, `Browse Orgs`, `Chart Primitive`, `Settings & Diff Accordion`, `Spreadsheet Skeletons`, `Alert Primitive`, `Filter Chips`, `Page Loading`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **What connects `RFC-4180` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Legislators & Committee Contacts` be split into smaller, more focused modules?**
  _Cohesion score 0.06376811594202898 - nodes in this community are weakly interconnected._
- **Why does `Button` connect `Access Request Buttons` to `Legislators & Committee Contacts`, `Loading States & Bulk Assign`, `Kanban Column Options`, `Testimony Export & Preview`, `Admin Dashboard`, `Testimonies Pages`, `Kanban Header & CSV Export`, `shadcn Primitives`, `Discover & Search UI`, `Kanban Card & Dead Bills`, `Bill Briefing & Details Dialog`, `Bill Versions Panel`, `Main Layout & Nav`, `Auth Header & Menu`, `Version Diff Engine`, `Register & Reset Pages`, `Search Filter Rail`, `Testimony Editor Page`, `Version Compare & Editor`, `Kanban Board & Columns`, `Calendar View`, `Email Verify & Login Wall`, `Boards Pages`, `Your Bills Board`, `CSV Export`, `Testimony Submit Guide`, `Intern Selector & Buttons`, `Browse Orgs`, `Settings & Diff Accordion`, `Filter Chips`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `OAuth Provider Callbacks` be split into smaller, more focused modules?**
  _Cohesion score 0.07826694619147449 - nodes in this community are weakly interconnected._
- **Why does `Bill` connect `Kanban Column Options` to `Loading States & Bulk Assign`, `Kanban Board & Columns`, `Human Proposals & Permissions`, `Bills Read & Mapping`, `Admin Dashboard`, `Bill Tracking Actions`, `Bill Mappers & Types`, `Org Boards & Follows`, `Bill Assignment`, `Bill Filters & Search`, `Kanban Card & Dead Bills`, `Bill Briefing & Details Dialog`, `Boards Pages`, `CSV Export`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Should `Password & Verification Emails` be split into smaller, more focused modules?**
  _Cohesion score 0.08862745098039215 - nodes in this community are weakly interconnected._