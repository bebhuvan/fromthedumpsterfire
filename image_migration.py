import os
import re
import shutil
from pathlib import Path

def get_image_size(filename):
    match = re.search(r'-(\d+)x(\d+)', filename)
    if match:
        width, height = map(int, match.groups())
        return width * height
    return float('inf')

def copy_largest_images():
    # Source directory (your WordPress images)
    src_dir = os.path.expanduser('~/Downloads/hugo-export/wp-content/uploads')
    
    # Destination directory (Quartz images)
    dest_dir = os.path.expanduser('~/Documents/personal/quartz-garden/content/images')
    
    # Create destination directory
    os.makedirs(dest_dir, exist_ok=True)
    
    # Process each file
    for root, _, files in os.walk(src_dir):
        image_groups = {}
        for file in files:
            if file.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
                base_name = re.sub(r'-\d+x\d+(\.[^.]+)$', r'\1', file)
                year_month = os.path.relpath(root, src_dir)
                
                if base_name not in image_groups:
                    image_groups[base_name] = []
                image_groups[base_name].append((os.path.join(root, file), year_month))
        
        # Copy largest version of each image
        for versions in image_groups.values():
            largest = max(versions, key=lambda x: get_image_size(os.path.basename(x[0])))
            source_file, year_month = largest
            
            target_dir = os.path.join(dest_dir, year_month)
            os.makedirs(target_dir, exist_ok=True)
            
            target_file = os.path.join(target_dir, os.path.basename(source_file))
            shutil.copy2(source_file, target_file)
            print(f"Copied {os.path.basename(source_file)}")

if __name__ == "__main__":
    copy_largest_images()
