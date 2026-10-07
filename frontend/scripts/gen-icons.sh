#!/bin/bash
# PQTABS premium 3D icon set — consistent gold-on-black renders, later cut to transparent.
set -u
OUT=/home/z/my-project/public/icons3d/raw
mkdir -p "$OUT"

STYLE="Premium 3D render icon of {SUBJECT}. Glossy polished gold metal with warm amber reflections, subtle dark graphite metal details. Floating at a slight dynamic angle, centered composition with generous margin around the object. Soft studio rim lighting, gentle warm glow on the metal. Isolated on a pure solid black background, absolutely no background elements, no floor, no shadows on background, no text, no watermark. High-end fintech security aesthetic, octane render, ultra detailed."

gen() {
  local name="$1"; local subject="$2"
  local prompt="${STYLE//\{SUBJECT\}/$subject}"
  z-ai image -p "$prompt" -o "$OUT/$name.png" -s 1024x1024 >/dev/null 2>&1 \
    && echo "OK  $name" || echo "FAIL $name"
}

# batch 1
gen "key"     "an ornate golden key with a round bow and cut blade" &
gen "card"    "a glossy golden blank credit card floating tilted in space with a subtle gold chip square" &
gen "robot"   "a friendly geometric robot head, dark graphite metal with glowing warm gold eyes and thin gold accent lines" &
gen "coin"    "a neat stack of three golden coins, the top coin embossed with a dollar sign" &
wait
# batch 2
gen "lock"    "a polished golden padlock with a rounded shackle, closed, floating" &
gen "vault"   "a massive round bank vault door with golden spokes and a central combination dial, three-quarter view" &
gen "hourglass" "a golden hourglass with glowing amber sand streaming down" &
gen "hex"     "a glossy golden hexagonal gem prism with faceted faces catching light" &
wait
# batch 3
gen "shield"  "a golden heraldic shield with a keyhole cutout in the center" &
gen "check"   "a golden circular seal badge with a bold checkmark embossed in the center" &
gen "gauge"   "a golden semicircular gauge meter with a slim needle and small tick marks" &
gen "quantum" "a golden sphere encircled by three thin elliptical orbit rings like an atom model" &
wait
echo "DONE"
