# GitMarks

GitMarks is a Chrome extension that syncs your Chrome bookmarks with a Git repository, allowing you to backup, restore, and synchronize your bookmarks across multiple devices.

## Features

- **Sync Bookmarks with Git**: Automatically sync your Bookmarks Bar with a Git repository
- **Force Sync**: Overwrite remote changes with local bookmarks
- **Sync Status**: Display sync status and unsynced items count
- **Bookmark Counting**: Show the total number of bookmarks in your Bookmarks Bar
- **Folder Navigation**: Navigate through bookmark folders with breadcrumb navigation

## Installation

1. **Download or clone** this repository to your local machine
2. **Open Chrome** and navigate to `chrome://extensions`
3. **Enable Developer mode** by toggling the switch in the top right corner
4. **Click "Load unpacked"** and select the `gitmarks` folder
5. The extension will now appear in your Chrome toolbar

## Usage

### Setting up Git Configuration

1. **Click the GitMarks icon** in your Chrome toolbar
2. **Fill in the Git configuration fields**:
   - **Git repository URL**: The URL of your Git repository (e.g., `https://gitee.com/username/repo.git`)
   - **Git access token**: Your personal access token for the Git repository
   - **File path**: The path to the file where bookmarks will be stored (e.g., `bookmarks.json`)

### Syncing Bookmarks

- **Sync to Git**: Click the "Sync to Git" button to sync your local bookmarks to the remote repository
- **Force Sync to Git**: Click the "Force Sync to Git" button to overwrite remote changes with your local bookmarks
- **Sync from Git**: Click the "Sync from Git" button to sync remote bookmarks to your local browser

### Checking Sync Status

- **Click the "Check Status" button** to see the current sync status
- The status will show:
  - Local bookmark count
  - Remote bookmark count
  - Number of unsynced items
  - Last sync time
  - Remote repository information

## Permissions

GitMarks requires the following permissions:

- **bookmarks**: To read and modify your Chrome bookmarks
- **storage**: To store Git configuration and sync status
- **tabs**: To access tab information when needed
- **activeTab**: To access the currently active tab

## Troubleshooting

### Common Issues

1. **Sync failed: Resource::kQuotaBytesPerItem quota exceeded**
   - This error occurs when the sync status data is too large
   - GitMarks uses SHA-1 hashing to minimize storage usage, but if you have a very large bookmark collection, you may still encounter this
   - Try reducing the number of bookmarks or folders

2. **Sync failed: Failed to execute 'btoa' on 'Window'**
   - This error occurs when trying to sync bookmarks with non-Latin1 characters
   - GitMarks uses proper UTF-8 encoding to handle this

3. **Last updated: Invalid Date**
   - This error occurs when the date format from the Git API is not recognized
   - GitMarks includes error handling to display the current date instead

4. **Local has changes not synced to remote**
   - This error occurs when the Chrome Bookmarks API returns dynamic fields that change every time
   - GitMarks removes dynamic fields before calculating sync status to avoid this

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
