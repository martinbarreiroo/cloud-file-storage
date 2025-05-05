#!/bin/bash

echo "Configuring permissions for Git hooks..."

git config core.hooksPath .scripts

# Set executable permissions for pre-commit hook
chmod +x .scripts/pre-commit
# Add other hooks here ...

echo "Git hooks permissions configured successfully."
