---
name: commerce-product-faq
version: 1.0.0
description: Plan and control a product_faq video that answers one concrete question with evidence and limits.
---

## Trigger
Use when the viewer has one explicit purchase or use question.

## Exclude
Do not broaden into a generic launch, multi-topic tutorial, unsupported recommendation, or absolute claim.

## Inputs
Require the exact question, supported answer/facts, evidence, limitations, next step, project/base revision, and authorization.

## Tool order
Read project; search only question-relevant resources; validate question, direct answer, evidence, limitations, next step; submit job; poll and list artifacts.

## Output
Return question/answer/evidence mapping, editable text, real job/revision, candidate video, and review state.

## Preserve
Preserve the exact question scope, qualifications, product identity, source ranges, audio, and unmentioned objects.

## Failure
State that the answer is unsupported or ask one minimal clarification; never replace evidence with category assumptions.

## Acceptance
The video answers the stated question, shows supporting evidence, and visibly communicates material limitations. Source: `commerce/scenes/product-faq/`.
