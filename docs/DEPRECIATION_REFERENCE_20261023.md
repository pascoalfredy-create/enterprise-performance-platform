# Depreciation reference — Angola — 23 October 2026

## Verified source and scope

Decreto Presidencial n.º 207/15, 5 November 2015, Diário da República I Série n.º 152. The original gazette scan was inspected; the general table G (81 entries), printed pages 3862–3864, is versioned in `lib/data/ao-depreciation-207-15.json`. Source URL is recorded in `lib/depreciation-reference.ts`. This is a reference to the published 2015 instrument, not a declaration that no subsequent legislation or special regime applies.

Article 6 gives precedence to sector-specific rates. The interface explicitly identifies the catalogue as the **general table only**. The remaining sector tables are not activated. Their transcription includes ambiguous or inconsistent printed rows, including B4.1 (3.33% / 3 years) and M3.5 (4% / 50 years); these must not be silently corrected or offered as validated automatic defaults. Tax eligibility, incentives and approvals are not inferred.

General groups: buildings/constructions, installations, machinery/equipment, vehicles/transport, furniture/tools. Preserve exact rates: computers G3.1 = 33.33%, light vehicles G4.1.2 = 25%, heavy vehicles G4.1.1 = 16.67%, office wooden furniture G5.5.1 = 16.67%. G2.7 telephone exchanges = 16.66%, while G3.15 telephone terminals = 16.67%. Published useful life is displayed separately and never substituted for the rate.

## Study calculation

The existing integrated study gains an optional annual depreciation rate and category reference. Selecting a category is an explicit draft change; saving uses the established study workflow. Old studies without a rate retain their existing useful-life formula. A zero rate selects that legacy formula. New calculations never replace approved versions.

One rate applies to the study's investment pool, as in the existing single-useful-life model. The interface warns against applying one category to a mixed asset pool. Per-asset, multi-category modelling and automatic budget posting are **not implemented in this change**. Existing approved monthly depreciation source mappings remain the budget mechanism; no direct fiscal or accounting entry is created.

Forecast base: initial investment including nonrecoverable VAT less residual, plus each reinvestment's own base. For each investment, cumulative depreciation = ROUND(MIN(base, base × annual percentage × elapsed months / 1200), 2). Monthly charge is the difference between successive cumulative totals. Initial assets begin in model month 1; each reinvestment begins in its actual configured model month. No invented absolute in-service date. No cash payment is produced from depreciation.

The rate's published precision is retained, so 33.33% can leave a small residue after 36 months; the next month's charge is capped at that residue. This is a management forecast convention, not a tax quota compliance determination.

## Excel and languages

The exported workbook retains live formulas and an editable annual rate in assumptions (0–100%). Asset-specific cumulative helpers are protected and hidden within existing calculation rows; no extra document or alternate interface is introduced. The category reference and method are included in explanatory notes. Reimport restores the category only if the rate still matches; an Excel rate edit becomes a custom assumption. Old Excel exports remain accepted.

Portuguese, English, Spanish, French and Russian controls and explanations are supplied. Official asset descriptions retain their Portuguese legal wording, identified as such.

## Validation

Run typecheck, i18n audit, full build/test suite and actual browser review before production deployment. Targeted tests cover published precision, service-period boundaries, residual, cumulative rounding, safe integer amounts, invalid inputs, independent reinvestment caps, balance/cash reconciliation and live Excel round-trip/reference handling.
