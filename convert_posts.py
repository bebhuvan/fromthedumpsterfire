import os
import frontmatter
import shutil

# Paths
source_dir = os.path.expanduser('~/Downloads/hugo-export/posts')
target_dir = os.path.expanduser('~/Documents/personal/quartz-garden/content/posts')

def convert_post(filename):
    try:
        # Read the post
        with open(os.path.join(source_dir, filename), 'r', encoding='utf-8') as f:
            post = frontmatter.load(f)
        
        # Simplify frontmatter
        new_frontmatter = {
            'title': post.get('title', '').replace('{.wp-block-heading}', '').strip(),
            'date': str(post.get('date', ''))[:10],  # Get just the YYYY-MM-DD part
            'tags': post.get('categories', [])
        }
        
        # Create new post
        new_post = frontmatter.Post(post.content, **new_frontmatter)
        
        # Write to target directory
        with open(os.path.join(target_dir, filename), 'w', encoding='utf-8') as f:
            f.write(frontmatter.dumps(new_post))
        print(f"Converted {filename}")
        
    except Exception as e:
        print(f"Error converting {filename}: {str(e)}")

def main():
    # Clear target directory
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)
    os.makedirs(target_dir)
    
    # Convert all markdown files
    for filename in os.listdir(source_dir):
        if filename.endswith('.md'):
            convert_post(filename)

if __name__ == "__main__":
    main()
