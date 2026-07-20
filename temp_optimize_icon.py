from PIL import Image, ImageOps
from pathlib import Path

p = Path('docs/images/favicon.png')
img = Image.open(p).convert('RGBA')

size = 1024
canvas = Image.new('RGBA', (size, size), (255, 255, 255, 0))

# Create a simple premium background color that makes the brand image stand out
background = Image.new('RGBA', (size, size), (10, 86, 136, 255))
canvas.alpha_composite(background)

# Keep the original artwork clean and dominant
resized = ImageOps.contain(img, (860, 860))
x = (size - resized.width) // 2
y = (size - resized.height) // 2
canvas.alpha_composite(resized, (x, y))

canvas.save(p, format='PNG')
print('optimized', p, canvas.size)
