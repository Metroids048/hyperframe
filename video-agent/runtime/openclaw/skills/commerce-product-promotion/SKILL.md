---
name: commerce-product-promotion
version: 1.0.0
description: Plan and control a product_promotion video with exact event terms, conditions, and action.
---

## Trigger
Use only when the user explicitly provides a promotion, launch event, live event, discount, benefit, or participation objective.

## Exclude
Do not infer price, discount, dates, stock, urgency, platform mechanics, or legal terms from a generic sales request.

## Inputs
Require verified event identity, value, dates/conditions, participation method, product evidence, project/base revision, and authorization.

## Tool order
Read project; search suitable resources; validate event identity, participation value, verified terms, action; submit job; poll and list artifacts.

## Output
Return exact term-to-text/evidence mapping, native text objects, job/revision, candidate video, and quality state.

## Preserve
Preserve wording, dates, qualifiers, product identity, readable duration, audio constraints, and all unrequested objects.

## Failure
Ask for a missing material term or omit the unsupported offer; never create a plausible-looking promotion.

## Acceptance
Every visible offer and action matches supplied terms and remains readable in the rendered video. Source: `commerce/scenes/product-promotion/`.
