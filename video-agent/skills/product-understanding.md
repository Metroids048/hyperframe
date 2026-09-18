# Product Understanding Skill

## Purpose

Before editing, fuse the user's text, product images, product video observations, verified facts and brand information into one evidence-backed `ProductBrief`.

## Input

- original user request and confirmed facts
- image observations
- video observations with source time ranges
- material analysis, rights and uncertainty records
- optional product description, brand information and platform intent

## Output

Write `product-brief.json` with `schema_version: 2` and these stable fields:

- `product_name`
- `category`
- `visual_features`
- `selling_points`
- `target_customer`
- `usage_scenarios`
- `brand_style`
- `recommended_platform`
- `forbidden_claims`
- `unknowns`
- `fusion_summary`

Every visual feature and selling point must reference a user fact or observed asset evidence. Suggestions about audience, platform and usage are marketing hypotheses, not product facts. Never infer facts from filenames, never promote uncertainty to a claim, and always carry unsupported claims into `forbidden_claims`.

This skill is executed by the staged production tool `product.understand`; producing this document outside that tool does not count as implementation.
