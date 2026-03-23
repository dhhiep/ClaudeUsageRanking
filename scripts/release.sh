#!/bin/bash
# Release script for Claude Usage Ranking Chrome Extension
# Creates versioned zip files in releases/ folder

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_ROOT/src"
RELEASES_DIR="$PROJECT_ROOT/releases"
MANIFEST_FILE="$SRC_DIR/manifest.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get current version from manifest.json
get_current_version() {
    grep -o '"version": "[^"]*"' "$MANIFEST_FILE" | sed 's/"version": "//;s/"//'
}

# Update version in manifest.json
update_manifest_version() {
    local new_version="$1"
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$MANIFEST_FILE"
}

# Parse semver components
parse_version() {
    local version="$1"
    MAJOR=$(echo "$version" | cut -d. -f1)
    MINOR=$(echo "$version" | cut -d. -f2)
    PATCH=$(echo "$version" | cut -d. -f3)
}

# Create zip file
create_release_zip() {
    local version="$1"
    local zip_name="ClaudeUsageRanking_${version}.zip"
    local zip_path="$RELEASES_DIR/$zip_name"

    # Ensure releases directory exists
    mkdir -p "$RELEASES_DIR"

    # Remove existing zip if exists
    if [ -f "$zip_path" ]; then
        rm "$zip_path"
        echo -e "${YELLOW}Replaced existing:${NC} $zip_name"
    fi

    # Create zip from src directory
    cd "$SRC_DIR"
    zip -r "$zip_path" . -x "*.DS_Store" -x "__MACOSX/*" > /dev/null 2>&1
    cd "$PROJECT_ROOT"

    echo -e "${GREEN}✓ Created:${NC} $zip_name"
    echo -e "${BLUE}  Location:${NC} $zip_path"
    echo -e "${BLUE}  Size:${NC} $(du -h "$zip_path" | cut -f1)"
}

# Display menu
show_menu() {
    local current_version=$(get_current_version)
    parse_version "$current_version"

    local next_patch="$MAJOR.$MINOR.$((PATCH + 1))"
    local next_minor="$MAJOR.$((MINOR + 1)).0"
    local next_major="$((MAJOR + 1)).0.0"

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}   Claude Usage Ranking - Release Manager${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Current version: ${GREEN}$current_version${NC}"
    echo ""
    echo -e "  ${YELLOW}1)${NC} Rebuild current version    → ${GREEN}$current_version${NC}"
    echo -e "  ${YELLOW}2)${NC} Bump patch (bug fixes)     → ${GREEN}$next_patch${NC}"
    echo -e "  ${YELLOW}3)${NC} Bump minor (new features)  → ${GREEN}$next_minor${NC}"
    echo -e "  ${YELLOW}4)${NC} Bump major (breaking)      → ${GREEN}$next_major${NC}"
    echo -e "  ${YELLOW}5)${NC} Custom version"
    echo -e "  ${YELLOW}q)${NC} Quit"
    echo ""
}

# Main
main() {
    local current_version=$(get_current_version)
    parse_version "$current_version"

    show_menu

    read -p "Select option [1-5, q]: " choice
    echo ""

    case $choice in
        1)
            echo -e "${YELLOW}Rebuilding current version...${NC}"
            create_release_zip "$current_version"
            ;;
        2)
            local new_version="$MAJOR.$MINOR.$((PATCH + 1))"
            echo -e "${YELLOW}Bumping patch version to $new_version...${NC}"
            update_manifest_version "$new_version"
            create_release_zip "$new_version"
            ;;
        3)
            local new_version="$MAJOR.$((MINOR + 1)).0"
            echo -e "${YELLOW}Bumping minor version to $new_version...${NC}"
            update_manifest_version "$new_version"
            create_release_zip "$new_version"
            ;;
        4)
            local new_version="$((MAJOR + 1)).0.0"
            echo -e "${YELLOW}Bumping major version to $new_version...${NC}"
            update_manifest_version "$new_version"
            create_release_zip "$new_version"
            ;;
        5)
            read -p "Enter custom version (e.g., 2.1.0): " custom_version
            if [[ ! "$custom_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                echo -e "${RED}Invalid version format. Use X.Y.Z${NC}"
                exit 1
            fi
            echo -e "${YELLOW}Setting version to $custom_version...${NC}"
            update_manifest_version "$custom_version"
            create_release_zip "$custom_version"
            ;;
        q|Q)
            echo "Cancelled."
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            exit 1
            ;;
    esac

    echo ""
    echo -e "${GREEN}✓ Release complete!${NC}"
}

main
