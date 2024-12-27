import os
import frontmatter
import re

# Paths
source_dir = os.path.expanduser('~/Downloads/hugo-export/posts')
dest_dir = os.path.expanduser('~/Documents/personal/quartz-garden/content/posts')

def fix_image_paths(content):
    # Convert WordPress image URLs to local paths
    content = re.sub(
        r'https://fromthedumpsterfire.com/wp-content/uploads/',
        '/images/',
        content
    )
    # Fix local WordPress paths
    content = re.sub(
        r'/wp-content/uploads/',
        '/images/',
        content
    )
    return content

def copy_post(filename):
    with open(os.path.join(source_dir, filename), 'r', encoding='utf-8') as f:
        post = frontmatter.load(f)
    
    # Fix image paths in content
    new_content = fix_image_paths(post.content)
    
    # Keep essential frontmatter and add fixed content
    new_post = frontmatter.Post(
        new_content,
        title=post.get('title', ''),
        date=str(post.get('date', ''))[:10],
        tags=post.get('categories', [])
    )
    
    # Write to destination
    with open(os.path.join(dest_dir, filename), 'w', encoding='utf-8') as f:
        f.write(frontmatter.dumps(new_post))
    print(f"Copied {filename}")

def main():
    # Create posts directory if needed
    os.makedirs(dest_dir, exist_ok=True)
    
    # Clear existing posts
    for f in os.listdir(dest_dir):
        if f.endswith('.md'):
            os.remove(os.path.join(dest_dir, f))
    
    # Copy and fix each post
    for filename in os.listdir(source_dir):
        if filename.endswith('.md'):
            copy_post(filename)

if __name__ == '__main__':
    main()
