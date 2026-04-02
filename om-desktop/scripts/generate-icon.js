#!/usr/bin/env node
/**
 * Generate app icon PNG (1024x1024) for Om Desktop
 * Run: node scripts/generate-icon.js
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// Create 1024x1024 icon
const size = 1024;
const png = new PNG({ width: size, height: size });

// Om logo design - microchip inspired (scaled up from menu bar icon)
const centerX = size / 2;
const centerY = size / 2;
const squareSize = 650;
const halfSquare = squareSize / 2;

// Logo color - dark gray
const logoColor = { r: 80, g: 80, b: 80 };

// Draw rounded square background
const cornerRadius = 140;
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const idx = (size * y + x) << 2;
    const dx = Math.abs(x - centerX);
    const dy = Math.abs(y - centerY);

    // Check if inside rounded square bounds
    if (dx <= halfSquare && dy <= halfSquare) {
      const distFromEdgeX = halfSquare - dx;
      const distFromEdgeY = halfSquare - dy;

      let isInside = false;
      if (distFromEdgeX < cornerRadius && distFromEdgeY < cornerRadius) {
        // Corner area - check rounded corner
        const cornerDist = Math.sqrt(
          Math.pow(cornerRadius - distFromEdgeX, 2) +
            Math.pow(cornerRadius - distFromEdgeY, 2)
        );
        isInside = cornerDist <= cornerRadius;
      } else {
        isInside = true;
      }

      if (isInside) {
        png.data[idx] = logoColor.r;
        png.data[idx + 1] = logoColor.g;
        png.data[idx + 2] = logoColor.b;
        png.data[idx + 3] = 255;
      }
    }
  }
}

// Draw center lozenge star shape (white, 4-pointed - simpler approach)
const whiteColor = { r: 255, g: 255, b: 255 };
const starLength = 186; // Length of each point
const starWidth = 100; // Width at the widest part

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const idx = (size * y + x) << 2;
    const dx = x - centerX;
    const dy = y - centerY;

    // Four lozenge points using superellipse for smooth rounded tips
    let inStar = false;

    // Check each of the 4 directions
    const checkPoint = (px, py) => {
      const absPx = Math.abs(px);
      const absPy = Math.abs(py);

      // Superellipse formula for lozenge shape with rounded tips
      // (|x|/a)^n + (|y|/b)^n <= 1, where n controls roundness
      const a = starWidth / 2; // Half width
      const b = starLength; // Length
      const n = 2.0; // Lower exponent = sharper taper, pointier tips

      const term1 = Math.pow(absPx / a, n);
      const term2 = Math.pow(absPy / b, n);

      return term1 + term2 <= 1.0;
    };

    // Check all four orientations
    inStar = inStar || checkPoint(dx, dy); // Top-right
    inStar = inStar || checkPoint(dx, -dy); // Bottom-right
    inStar = inStar || checkPoint(dy, dx); // Rotated 90°
    inStar = inStar || checkPoint(dy, -dx); // Rotated 90° flipped

    if (inStar) {
      png.data[idx] = whiteColor.r;
      png.data[idx + 1] = whiteColor.g;
      png.data[idx + 2] = whiteColor.b;
      png.data[idx + 3] = 255;
    }
  }
}

// Draw microchip dots/pins around the square edges
const dotRadius = 37;
const dotSpacing = 186;
const dotPositions = [];

// Top edge dots
for (let i = -1; i <= 1; i++) {
  dotPositions.push({
    x: centerX + i * dotSpacing,
    y: centerY - halfSquare - 93,
  });
}
// Bottom edge dots
for (let i = -1; i <= 1; i++) {
  dotPositions.push({
    x: centerX + i * dotSpacing,
    y: centerY + halfSquare + 93,
  });
}
// Left edge dots
for (let i = -1; i <= 1; i++) {
  dotPositions.push({
    x: centerX - halfSquare - 93,
    y: centerY + i * dotSpacing,
  });
}
// Right edge dots
for (let i = -1; i <= 1; i++) {
  dotPositions.push({
    x: centerX + halfSquare + 93,
    y: centerY + i * dotSpacing,
  });
}

for (const pos of dotPositions) {
  for (
    let y = Math.floor(pos.y - dotRadius);
    y <= Math.ceil(pos.y + dotRadius);
    y++
  ) {
    for (
      let x = Math.floor(pos.x - dotRadius);
      x <= Math.ceil(pos.x + dotRadius);
      x++
    ) {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const dx = x - pos.x;
        const dy = y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= dotRadius) {
          const idx = (size * y + x) << 2;
          png.data[idx] = logoColor.r;
          png.data[idx + 1] = logoColor.g;
          png.data[idx + 2] = logoColor.b;
          png.data[idx + 3] = 255;
        }
      }
    }
  }
}

// Write PNG file
const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const iconPath = path.join(assetsDir, 'icon.png');
png.pack().pipe(fs.createWriteStream(iconPath));

console.log('✓ Generated icon.png (1024x1024)');
console.log('');
console.log('Next steps:');
console.log('1. Convert to .icns: npm run icon:convert');
console.log('   (or manually: iconutil -c icns assets/icon.iconset)');
