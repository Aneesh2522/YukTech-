# YUKTECH Admin Panel — deployment and setup

This package preserves the existing multi-page YUKTECH HTML/CSS/JS site, its page URLs, `Images/`, logo, and navy/teal design. It adds a starter CMS/admin system using Supabase (authentication, PostgreSQL, image storage and row-level security) and Netlify hosting/functions. **It is not live until the external services are configured and deployed.**

## What is included

- `admin/index.html`, `admin.css`, `admin.js`: private sign-in/dashboard with role-aware content, jobs, media, review queue and role management.
- `supabase/schema.sql`: tables and row-level security policies for `admin`, `editor`, and `reviewer` roles.
- `cms-config.example.js`: public-site connection settings template.
- `admin/config.example.js`: admin connection settings template.
- `assets/yuktech-cms.js`: renders approved CMS fields and published Careers jobs on public pages.
- `netlify/functions/dispatch-approved-job.mjs`: optional authenticated webhook bridge for an ATS/distribution provider.
- `netlify.toml`: Netlify publish/functions and basic response headers.

## Recommended architecture

1. **Netlify** hosts the existing static pages and the `/admin/` path.
2. **Supabase Auth** handles login; the website never stores passwords itself.
3. **Supabase Postgres + RLS** enforces permissions server-side. Hiding a button in JavaScript is not security.
4. **Supabase Storage** holds public website images; only assigned admins/editors can upload, and only admins can delete.
5. **Review workflow:** editor saves a draft → editor submits for review → reviewer/admin publishes or rejects. Publishing makes the approved record available to the public CMS bridge.
6. **External jobs:** the dashboard stores a target platform and application URL. The optional Netlify function can send approved jobs to an ATS/webhook that you are authorized to use. It does not bypass LinkedIn, Indeed, or Naukri access rules; direct publishing requires the provider's approved API/account access or a compatible ATS integration.

## Step 1 — create a backup and keep the existing repository

- Make a backup of the current GitHub repository before replacing or moving files.
- Extract this ZIP. Copy the **contents of the `YUKTECH/` folder** into the root of your existing `Aneesh2522/Yuktech` repository, merging files and keeping the existing `Images/` and all page files. Do not create an accidental nested `YUKTECH/YUKTECH/` folder.
- If the GitHub repository already has all these latest files, copy only the new/updated `admin/`, `supabase/`, `assets/`, `netlify/`, `netlify.toml`, `SETUP_ADMIN_PANEL.md`, `cms-config.example.js`, `cms-config.js`, and Careers/CSS/script-tag changes. Review diffs before committing.

## Step 2 — create Supabase project

1. Create a project at https://supabase.com/ and choose a strong database password. The free tier may be enough for initial testing; review current quotas and backup/retention needs.
2. Open **SQL Editor**, paste and run `supabase/schema.sql`.
3. Open **Project Settings → API** (or API Keys). Copy the project URL and the publishable/anon key. Never use the `service_role` secret in a browser file.
4. In `cms-config.js` and `admin/config.js`, replace the two placeholders with the same project URL and publishable/anon key. The publishable key is okay to be public only because RLS policies protect the database; do not disable RLS.

## Step 3 — create the first administrator safely

1. In Supabase **Authentication → Users**, add the first admin user with a strong password (or invite the user's email). Verify the email if required by the project's Auth settings.
2. Copy that user's UUID from the Users screen.
3. In SQL Editor, run this command after replacing the UUID:

```sql
insert into public.user_roles (user_id, role)
values ('REPLACE-WITH-AUTH-USER-UUID', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

4. Open `/admin/` on the deployed site and sign in. **Do not try to create the first admin from the public website.** The first role is bootstrapped by the project owner in SQL.
5. Use **User roles** to assign `editor` or `reviewer` to other existing Supabase Auth users. Create/invite each user in Supabase Auth first. Only give `admin` to trusted owners.

Roles:
- `admin`: user management, edit, review/publish, close jobs, upload/delete media.
- `editor`: create/edit drafts, upload media, submit drafts for review.
- `reviewer`: review/publish/reject and close jobs. Reviewer access is not intended for routine content editing.

## Step 4 — connect content fields to the existing pages

The existing HTML is mostly hard-coded. A CMS cannot safely guess which paragraph or image you intend to edit. The included public bridge updates only elements that you explicitly mark with data attributes.

Example text:

```html
<h1 data-cms-key="home.hero.title">The right talent. The right opportunity.</h1>
<p data-cms-key="home.hero.description">Your existing description stays here.</p>
```

Example image:

```html
<img src="./Images/Kapil.png" alt="Kapil Jain" data-cms-image="site.founder.photo">
```

Then in **Admin → Website content**, create a field using the exact same key. Use type `Text`, `URL`, or `Image URL`. Save it, choose **Submit for review**, and a reviewer/admin publishes it. To replace an image, upload it in **Media library**, copy the public URL, and save that URL under the matching image key as an `Image URL` field.

Suggested keys: `home.hero.title`, `home.hero.description`, `about.intro`, `services.staffing.description`, `founder.name`, `founder.bio`, `site.logo`, `site.founder.photo`. Add attributes to each page's exact intended elements. The bridge script is included in the existing HTML pages. The page hero title and first hero description on each main page are already tagged, and the site logo/founder image are marked for replacement. Additional paragraphs, cards, buttons and images should be tagged explicitly rather than bulk-tagging every element, because that could unexpectedly remove nested markup or styling.

## Step 5 — job postings

- Create a job under **Job postings**, save as draft, then **Submit for review**.
- A reviewer/admin checks the details and chooses **Publish**. Published jobs appear in `careers.html` after the CMS connection is configured.
- Add an HTTPS application URL from your ATS or approved job platform. Do not store candidate CVs or sensitive applicant data in public image storage.
- Editing a published job creates a replacement draft; publishing the replacement closes the prior listing.

## Step 6 — host on Netlify

1. Create/sign in to Netlify and choose **Add new site → Import an existing project**; connect GitHub and select `Aneesh2522/Yuktech`.
2. If the repository root contains `index.html`, use the root as base and publish directory `.`. If all site files are actually inside a `YUKTECH/` subdirectory, set the base directory to `YUKTECH` and publish directory `.` relative to that base.
3. Deploy. Test the site preview before changing DNS or switching the public URL. Keep the old GitHub Pages deployment until the new site passes tests.
4. Test `/admin/`, `/careers.html`, each existing page, images, contact form, and mobile navigation. Netlify deploy previews can be used to check changes before production.

## Step 7 — optional ATS / external job distribution

`netlify/functions/dispatch-approved-job.mjs` is a **generic webhook adapter**, not a direct LinkedIn/Indeed/Naukri integration. Configure Netlify environment variables only if your ATS/provider has an endpoint that accepts this payload:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (**server-side secret only; never add to HTML/JS or Git**)
- `JOB_DISTRIBUTION_WEBHOOK_URL` (fixed endpoint from your approved provider)
- `JOB_DISTRIBUTION_WEBHOOK_SECRET` (provider-issued secret)

The function validates the Supabase login, checks the user's reviewer/admin role, and verifies the job is already published before sending it. A production admin button to invoke this function and a provider-specific field mapping should be added only after you select the actual ATS/provider and obtain credentials. Never send arbitrary user-supplied URLs to this function.

Direct job-board posting is not universally available to every account. LinkedIn, Indeed, Naukri and ATS vendors have different partner/API approval and commercial requirements. Until a provider integration is approved, publish on the YUKTECH Careers page and use the approved external application/job link.

## Step 8 — verification checklist before going live

- [ ] Existing page paths, styling, logo and images still work.
- [ ] Anonymous visitor cannot open admin data or read drafts.
- [ ] Login with an unassigned user is rejected.
- [ ] Editor can save/submit drafts but cannot publish or assign roles.
- [ ] Reviewer can approve/reject but cannot assign roles.
- [ ] Admin can assign/remove roles.
- [ ] Uploaded images obey file size/type limits and public URLs load.
- [ ] Draft website text and draft jobs are not shown publicly.
- [ ] Approved content and jobs appear after publishing.
- [ ] External job webhook is tested in a staging/sandbox provider account before use.
- [ ] Netlify environment variables contain secrets; service-role key is not in Git history.
- [ ] Enable MFA for admin accounts, use strong passwords, review Supabase Auth settings, and set up a recovery/backup plan.

## Important implementation boundary

This is a deployable starter and security configuration, not a claim that your cloud accounts are already provisioned. You must create/configure Supabase and Netlify, set keys, bootstrap the first admin, and add `data-cms-*` keys for the exact text/images you want to manage. Provider-specific external posting cannot be completed without knowing the approved ATS/job-board API and credentials.
