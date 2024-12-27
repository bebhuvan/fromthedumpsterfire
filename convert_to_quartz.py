import os
import frontmatter
import re
from datetime import datetime

# Paths
hugo_dir = os.path.expanduser('~/Downloads/hugo-export/posts')
quartz_dir = os.path.expanduser('~/Documents/personal/quartz-garden/content/posts')

def fix_date(date_str):
    if not date_str:
        return datetime.now().strftime('%Y-%m-%d')
    try:
        if isinstance(date_str, str):
            return date_str[:10]  # Extract YYYY-MM-DD part
        return date_str.strftime('%Y-%m-%d')
    except:
        return datetime.now().strftime('%Y-%m-%d')

def clean_content(content):
    # Convert WordPress image URLs to local paths
    content = re.sub(
        r'https://fromthedumpsterfire.com/wp-content/uploads/(\d{4}/\d{2}/[^"\s]+)',
        r'/images/\1',
        content
    )
    
    # Clean WordPress specific formatting
    content = re.sub(r'\{\.wp-block-[^}]*\}', '', content)
    content = re.sub(r'\{\.has-[^}]*\}', '', content)
    
    # Remove WordPress specific HTML
    content = re.sub(r'<figure[^>]*class="[^"]*"[^>]*>', '<figure>', content)
    content = re.sub(r'<div[^>]*class="[^"]*"[^>]*>', '<div>', content)
    
    return content

def convert_post(filename):
    with open(os.path.join(hugo_dir, filename), 'r', encoding='utf-8') as f:
        post = frontmatter.load(f)
    
    # Clean up frontmatter
    new_frontmatter = {
        'title': post.get('title', '').replace('{.wp-block-heading}', '').strip(),
        'date': fix_date(post.get('date')),
        'tags': post.get('tags', []) + post.get('categories', [])
    }
    
    # Clean content
    cleaned_content = clean_content(post.content)
    
    # Create new post
    new_post = frontmatter.Post(cleaned_content, **new_frontmatter)
    
    # Write to Quartz directory
    with open(os.path.join(quartz_dir, filename), 'w', encoding='utf-8') as f:
        f.write(frontmatter.dumps(new_post))
    print(f"Converted {filename}")

def main():
    # Create posts directory if it doesn't exist
    os.makedirs(quartz_dir, exist_ok=True)
    
    # Convert all markdown files
    for filename in os.listdir(hugo_dir):
        if filename.endswith('.md'):
            convert_post(filename)

if __name__ == "__main__":
    main()
