import os
import re

replacements = {
    "🌡️": '<i data-lucide="thermometer-sun" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "🗺️": '<i data-lucide="map" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "🌳": '<i data-lucide="trees" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "📊": '<i data-lucide="bar-chart-2" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "🌿": '<i data-lucide="leaf" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "🔬": '<i data-lucide="microscope" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "🏠": '<i data-lucide="home" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "💧": '<i data-lucide="droplets" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "🛣️": '<i data-lucide="sun" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "🔄": '<i data-lucide="refresh-cw" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "🟢": '<i data-lucide="check-circle" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle; color: #2B8A3E;"></i>',
    "🟡": '<i data-lucide="alert-circle" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle; color: #F59F00;"></i>',
    "🔴": '<i data-lucide="x-circle" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle; color: #C92A2A;"></i>',
    "🟠": '<i data-lucide="alert-triangle" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle; color: #F59F00;"></i>',
    "⏱️": '<i data-lucide="clock" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "🔍": '<i data-lucide="search" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "🤖": '<i data-lucide="bot" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>',
    "📥": '<i data-lucide="download" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;"></i>'
}

files_to_check = [
    "frontend/scenarios.html",
    "frontend/analysis.html"
]

for filepath in files_to_check:
    with open(filepath, 'r') as f:
        content = f.read()
    
    for emoji, icon in replacements.items():
        content = content.replace(emoji, icon)
        
    # Also replace any stray emojis left in JS strings by ensuring lucide.createIcons() runs
    if "lucide.createIcons();" not in content and "<script" in content:
        content = content.replace("</body>", "    <script>\n        lucide.createIcons();\n    </script>\n</body>")

    with open(filepath, 'w') as f:
        f.write(content)

print("Replaced emojis in HTML files.")
