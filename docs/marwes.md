# Marwes adapter

[Token declarations, ownership and reconciliation](marwes-tokens.md) remain the detailed token reference. [Measured components](marwes-components.md) cover the Button/Card/StatTile pilot and its native override-proof gate. [Mode verification](mode-verification.md) checks actual resolved values and restores the original complete selection.

The adapter consumes the adopting project's installed library/theme, and keeps project knowledge outside the neutral core. Project extras remain declared inputs. Computed component values are measurements in a theme/state/viewport; token matches are candidates, not inferred semantic bindings. Native library generation and human adoption acceptance remain pending until observed proof exists.

`penpair marwes theme lint` compares declared project colors with installed defaults in light/dark mode. When primary changes, unchanged brand-family siblings with a distant hue become advisory warnings. Configure `marwes.themeLint.hueThresholdDegrees` (default 30) and exact `suppressions: [{theme:"light",token:"mw-color-border-brand",reason:"Intentional blue navigation"}]`. Suppressions remain visible. Transparent, non-literal and achromatic colors remain unknown; hue is neither a brand rule nor an accessibility score. Warnings return success and never rewrite themes or Penpot.

[Projected theme previews](theme-previews.md) resolve declared light/dark values offline without changing active selections or claiming native per-frame theme bindings.
