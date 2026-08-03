<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Keep FEATURES.md current

`FEATURES.md` is the map of this product: every screen, what it does, and how the features
depend on one another. **Read it before adding a feature, and update it in the same change
that ships one.** A change that adds, removes or materially alters a screen, a route, a
table, a setting or an environment variable is not finished until the file reflects it.

The section that matters most is **How the features connect**. This app is a chain —
playbook feeds analysis, contracts generate deliverables, onboarding and shipments block
content, content releases payments, actuals calibrate the playbook. Most real bugs here are
integration bugs, not local ones. When you add something, check it against that section and
wire up what it should gate, block, release or recompute; if you find a connection that
should exist and doesn't, say so.
