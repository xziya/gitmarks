// Storage keys
const STORAGE_KEY = 'tabFavorites';
const GIT_CONFIG_KEY = 'gitConfig';
const HIDE_GIT_CONFIG_KEY = 'hideGitConfig';
const SYNC_STATUS_KEY = 'syncStatus';

// Current navigation path
let currentPath = [];

// Item types
const ITEM_TYPE = {
  FOLDER: 'folder',
  TAB: 'tab'
};

// Execute when page is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Load Git configuration
  loadGitConfig();
  // Load favorites list
  loadFavorites();
  
  // Bind button events
  document.getElementById('syncToGit').addEventListener('click', function() {
    syncToGit(false);
  });
  document.getElementById('forceSyncToGit').addEventListener('click', function() {
    syncToGit(true);
  });
  document.getElementById('syncFromGit').addEventListener('click', syncFromGit);
  
  // Bind input events to save Git configuration
  document.getElementById('gitRepo').addEventListener('input', saveGitConfig);
  document.getElementById('gitToken').addEventListener('input', saveGitConfig);
  document.getElementById('gitFilePath').addEventListener('input', saveGitConfig);
  
  // Bind checkSyncStatus button event
  document.getElementById('checkSyncStatus').addEventListener('click', checkSyncStatus);
  
  // Check sync status on load
  checkSyncStatus();
});

// Load Git configuration
function loadGitConfig() {
  chrome.storage.sync.get([GIT_CONFIG_KEY], function(data) {
    if (data[GIT_CONFIG_KEY]) {
      document.getElementById('gitRepo').value = data[GIT_CONFIG_KEY].repo || '';
      document.getElementById('gitToken').value = data[GIT_CONFIG_KEY].token || '';
      document.getElementById('gitFilePath').value = data[GIT_CONFIG_KEY].filePath || '';
    }
  });
}

// Check sync status between local and remote
async function checkSyncStatus() {
  const syncStatusElement = document.getElementById('syncStatus');
  syncStatusElement.innerHTML = '<p>Checking sync status...</p>';
  
  // Get Git configuration
  const gitConfig = await new Promise(resolve => {
    chrome.storage.sync.get(GIT_CONFIG_KEY, function(data) {
      resolve(data[GIT_CONFIG_KEY] || {});
    });
  });
  
  if (!gitConfig.repo || !gitConfig.token || !gitConfig.filePath) {
    syncStatusElement.innerHTML = '<p style="color: #ff6347;">Please fill in complete Git configuration information</p>';
    return;
  }
  
  try {
    // Get only the Bookmarks Bar (id "1")
    const localBookmarks = await new Promise(resolve => {
      chrome.bookmarks.getSubTree('1', function(bookmarkBar) {
        if (bookmarkBar && bookmarkBar.length > 0) {
          resolve(bookmarkBar);
        } else {
          resolve([]);
        }
      });
    });
    
    // Get local sync status
    const syncStatus = await new Promise(resolve => {
      chrome.storage.sync.get(SYNC_STATUS_KEY, function(data) {
        resolve(data[SYNC_STATUS_KEY] || {});
      });
    });
    
    // Build API URL
    const repoParts = gitConfig.repo.match(/https:\/\/(.*)\/(.*)\/(.*)\.git/);
    if (!repoParts) {
      syncStatusElement.innerHTML = '<p style="color: #ff6347;">Git repository URL format is incorrect</p>';
      return;
    }
    
    const [, domain, owner, repo] = repoParts;
    const apiUrl = `https://${domain}/api/v5/repos/${owner}/${repo}/contents/${gitConfig.filePath}`;
    
    // Get remote file information
    const remoteResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${gitConfig.token}`
      }
    });
    
    if (remoteResponse.ok) {
      const remoteFile = await remoteResponse.json();
      const remoteSha = remoteFile.sha;
      // Fix date parsing by checking if updated_at exists and is valid
      let remoteUpdatedAt = new Date();
      if (remoteFile.updated_at) {
        remoteUpdatedAt = new Date(remoteFile.updated_at);
        // If date is still invalid, use current date
        if (isNaN(remoteUpdatedAt.getTime())) {
          remoteUpdatedAt = new Date();
        }
      }
      
      // Calculate local hash using SHA-1 for more efficient storage
      // Remove dynamic fields to ensure consistent hashing
      const cleanedBookmarks = removeDynamicFields(localBookmarks);
      const localJson = JSON.stringify(cleanedBookmarks, null, 2);
      const localHash = await sha1Hash(localJson);
      
      // Count bookmarks (only items with URL)
      function countBookmarks(bookmarks) {
        let count = 0;
        bookmarks.forEach(bookmark => {
          if (bookmark.url) {
            count++;
          } else if (bookmark.children && bookmark.children.length > 0) {
            count += countBookmarks(bookmark.children);
          }
        });
        return count;
      }
      
      const localBookmarkCount = countBookmarks(localBookmarks[0].children || []);
      
      // Get remote bookmarks
      let remoteBookmarkCount = 0;
      let unsyncedCount = 0;
      
      try {
        // 使用相应的解码方法来匹配编码过程
        const content = decodeURIComponent(escape(atob(remoteFile.content)));
        const remoteBookmarks = JSON.parse(content);
        // Remove dynamic fields to ensure consistent counting
        const cleanedRemoteBookmarks = removeDynamicFields(remoteBookmarks);
        remoteBookmarkCount = countBookmarks(cleanedRemoteBookmarks[0].children || []);
        
        // Calculate unsynced count
        unsyncedCount = Math.abs(localBookmarkCount - remoteBookmarkCount);
      } catch (e) {
        console.error('Error parsing remote bookmarks:', e);
      }
      
      // Determine sync status
      let status = '';
      let statusColor = '';
      
      if (syncStatus.lastSyncSha === remoteSha && syncStatus.lastSyncHash === localHash) {
        status = 'Local and remote are in sync';
        statusColor = '#4CAF50';
      } else if (syncStatus.lastSyncSha === remoteSha) {
        status = 'Local has changes not synced to remote';
        statusColor = '#ff9800';
      } else if (syncStatus.lastSyncHash === localHash) {
        status = 'Remote has changes not synced to local';
        statusColor = '#ff9800';
      } else {
        status = 'Both local and remote have changes';
        statusColor = '#ff6347';
      }
      
      // Display sync status
      syncStatusElement.innerHTML = `
        <p style="color: ${statusColor};"><strong>${status}</strong></p>
        <p><strong>Local:</strong></p>
        <p style="margin-left: 20px;">Bookmarks: ${localBookmarkCount}</p>
        <p style="margin-left: 20px;">Last synced: ${syncStatus.lastSyncTime ? new Date(syncStatus.lastSyncTime).toLocaleString() : 'Never'}</p>
        <p><strong>Remote:</strong></p>
        <p style="margin-left: 20px;">Bookmarks: ${remoteBookmarkCount}</p>
        <p style="margin-left: 20px;">Last updated: ${remoteUpdatedAt.toLocaleString()}</p>
        <p style="margin-left: 20px;">File: ${gitConfig.filePath}</p>
        <p><strong>Sync Status:</strong></p>
        <p style="margin-left: 20px;">Unsynced items: ${unsyncedCount}</p>
      `;
    } else {
      // Remote file doesn't exist
      syncStatusElement.innerHTML = `
        <p style="color: #ff9800;">Remote file does not exist</p>
        <p>Please run "Sync to Git" to create the file</p>
      `;
    }
  } catch (error) {
    console.error('Error checking sync status:', error);
    syncStatusElement.innerHTML = `<p style="color: #ff6347;">Error checking sync status: ${error.message}</p>`;
  }
}

// Save Git configuration
function saveGitConfig() {
  const gitConfig = {
    repo: document.getElementById('gitRepo').value,
    token: document.getElementById('gitToken').value,
    filePath: document.getElementById('gitFilePath').value
  };
  
  // Save Git config
  chrome.storage.sync.set({ [GIT_CONFIG_KEY]: gitConfig });
}

// Load favorites list
function loadFavorites() {
  console.log('Loading favorites...');
  try {
    if (chrome.bookmarks) {
      console.log('Chrome bookmarks API is available');
      // Get only the Bookmarks Bar (id "1")
      chrome.bookmarks.getSubTree('1', function(bookmarkBar) {
        console.log('Bookmarks Bar:', bookmarkBar);
        if (bookmarkBar && bookmarkBar.length > 0) {
          const bookmarksBarNode = bookmarkBar[0];
          console.log('Bookmarks Bar node:', bookmarksBarNode);
          console.log('Bookmarks Bar children:', bookmarksBarNode.children);
          displayFavorites(bookmarksBarNode.children || []);
        } else {
          console.log('No Bookmarks Bar found');
          displayFavorites([]);
        }
      });
    } else {
      console.error('Chrome bookmarks API is not available');
      displayFavorites([]);
    }
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    displayFavorites([]);
  }
}

// Remove dynamic fields from bookmarks to ensure consistent hashing
function removeDynamicFields(bookmarks) {
  if (Array.isArray(bookmarks)) {
    return bookmarks.map(item => removeDynamicFields(item));
  } else if (typeof bookmarks === 'object' && bookmarks !== null) {
    const cleanedItem = {
      id: bookmarks.id,
      title: bookmarks.title,
      url: bookmarks.url,
      children: bookmarks.children ? removeDynamicFields(bookmarks.children) : null
    };
    // Remove undefined or null properties
    Object.keys(cleanedItem).forEach(key => {
      if (cleanedItem[key] === undefined || cleanedItem[key] === null) {
        delete cleanedItem[key];
      }
    });
    return cleanedItem;
  }
  return bookmarks;
}

// SHA-1 hash function for more efficient storage
async function sha1Hash(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Navigate to folder
function navigateToFolder(folderId) {
  currentPath.push(folderId);
  loadFavorites();
}

// Navigate back to parent folder
function navigateBack() {
  if (currentPath.length > 0) {
    currentPath.pop();
    loadFavorites();
  }
}

// Get items at current path
function getItemsAtCurrentPath(favorites) {
  let items = favorites;
  for (const folderId of currentPath) {
    // Find the folder with the given id
    const folder = items.find(item => item.id == folderId);
    if (!folder || !folder.children) {
      return [];
    }
    items = folder.children;
  }
  return items;
}

// Update breadcrumb navigation
function updateBreadcrumb(favorites) {
  const breadcrumbElement = document.getElementById('breadcrumb');
  breadcrumbElement.innerHTML = '';
  
  // Add path items
  let currentItems = favorites;
  const pathIds = [];
  
  for (const folderId of currentPath) {
    // Find the folder with the given id
    const folder = currentItems.find(item => item.id == folderId);
    if (!folder) break;
    
    pathIds.push(folderId);
    
    const breadcrumbItem = document.createElement('span');
    breadcrumbItem.className = 'breadcrumb-item';
    breadcrumbItem.dataset.path = JSON.stringify(pathIds);
    breadcrumbItem.textContent = folder.title;
    breadcrumbItem.addEventListener('click', function() {
      const path = JSON.parse(this.dataset.path);
      currentPath = path;
      loadFavorites();
    });
    
    breadcrumbElement.appendChild(breadcrumbItem);
    currentItems = folder.children || [];
  }
  
  // Update bookmark count
  updateBookmarkCount(favorites);
}

// Update bookmark count
function updateBookmarkCount(favorites) {
  // Count only bookmarks in the Bookmarks Bar
  console.log('Updating bookmark count...');
  function countItems(bookmarks) {
    let count = 0;
    bookmarks.forEach(bookmark => {
      if (bookmark.url) {
        // This is a bookmark
        count++;
      } else if (bookmark.children && bookmark.children.length > 0) {
        // This is a folder, count its children
        count += countItems(bookmark.children);
      }
    });
    return count;
  }
  
  const itemCount = countItems(favorites);
  console.log('Bookmark count:', itemCount);
  document.getElementById('bookmarkCount').textContent = itemCount;
}

// Display favorites list
function displayFavorites(favorites) {
  // Update breadcrumb
  updateBreadcrumb(favorites);
  
  const listElement = document.getElementById('favoritesList');
  listElement.innerHTML = '';
  
  // Get items at current path
  const itemsAtCurrentPath = getItemsAtCurrentPath(favorites);
  
  if (itemsAtCurrentPath.length === 0) {
    listElement.innerHTML = '<p>No saved tabs</p>';
    return;
  }
  
  // Sort items: folders first, then tabs
  const sortedItems = [...itemsAtCurrentPath].sort((a, b) => {
    if (a.children && !b.children) return -1;
    if (!a.children && b.children) return 1;
    return 0;
  });
  
  sortedItems.forEach(function(item, index) {
    const itemElement = document.createElement('div');
    itemElement.className = 'favorite-item';
    itemElement.dataset.id = item.id;
    
    if (item.children) {
      // Display folder
      const folderHeader = document.createElement('div');
      folderHeader.style.display = 'flex';
      folderHeader.style.alignItems = 'center';
      folderHeader.style.cursor = 'pointer';
      folderHeader.style.padding = '5px 0';
      
      // Folder icon
      const folderIcon = document.createElement('span');
      folderIcon.style.marginRight = '8px';
      folderIcon.innerHTML = '&#128193;';
      folderIcon.style.fontSize = '14px';
      
      // Folder name
      const folderName = item.title || 'Untitled Folder';
      const folderNameElement = document.createElement('span');
      folderNameElement.textContent = folderName;
      folderNameElement.style.fontWeight = 'bold';
      
      folderHeader.appendChild(folderIcon);
      folderHeader.appendChild(folderNameElement);
      
      // Enable double click to navigate to folder
      let clickCount = 0;
      folderHeader.addEventListener('click', function() {
        clickCount++;
        setTimeout(function() {
          if (clickCount === 2) {
            // Double click - navigate to folder
            navigateToFolder(item.id);
          }
          clickCount = 0;
        }, 300);
      });
      
      // Add right-click context menu for folder
      itemElement.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        if (confirm(`Are you sure you want to delete folder "${folderName}"?`)) {
          chrome.bookmarks.removeTree(item.id);
          loadFavorites();
        }
      });
      
      itemElement.appendChild(folderHeader);
    } else {
      // Display bookmark
      const titleElement = document.createElement('div');
      titleElement.className = 'favorite-title';
      titleElement.textContent = item.title;
      
      const urlElement = document.createElement('div');
      urlElement.className = 'favorite-url';
      urlElement.textContent = item.url;
      
      // Add click event to open bookmark
      itemElement.addEventListener('click', function(e) {
        // Only open if not a right-click
        if (e.button === 0) {
          chrome.tabs.create({ url: item.url });
        }
      });
      
      // Add right-click context menu for bookmark
      itemElement.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        // Create a simple context menu
        const menu = document.createElement('div');
        menu.style.position = 'fixed';
        menu.style.top = e.clientY + 'px';
        menu.style.left = e.clientX + 'px';
        menu.style.backgroundColor = 'white';
        menu.style.border = '1px solid #ddd';
        menu.style.borderRadius = '4px';
        menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        menu.style.zIndex = '1000';
        
        // Delete option
        const deleteOption = document.createElement('div');
        deleteOption.style.padding = '8px 12px';
        deleteOption.style.cursor = 'pointer';
        deleteOption.textContent = 'Delete';
        deleteOption.addEventListener('click', function() {
          if (confirm(`Are you sure you want to delete this bookmark?`)) {
            chrome.bookmarks.remove(item.id);
            loadFavorites();
          }
          document.body.removeChild(menu);
        });
        deleteOption.addEventListener('mouseover', function() {
          deleteOption.style.backgroundColor = '#f5f5f5';
        });
        deleteOption.addEventListener('mouseout', function() {
          deleteOption.style.backgroundColor = 'white';
        });
        
        menu.appendChild(deleteOption);
        document.body.appendChild(menu);
        
        // Close menu when clicking outside
        setTimeout(function() {
          document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
              if (document.body.contains(menu)) {
                document.body.removeChild(menu);
              }
              document.removeEventListener('click', closeMenu);
            }
          });
        }, 10);
      });
      
      itemElement.appendChild(titleElement);
      itemElement.appendChild(urlElement);
    }
    
    listElement.appendChild(itemElement);
  });
}







// Sync to Git repository
async function syncToGit(force = false) {
  // Get Git configuration
  const gitConfig = await new Promise(resolve => {
    chrome.storage.sync.get(GIT_CONFIG_KEY, function(data) {
      resolve(data[GIT_CONFIG_KEY] || {});
    });
  });
  
  if (!gitConfig.repo || !gitConfig.token || !gitConfig.filePath) {
    alert('Please fill in complete Git configuration information');
    return;
  }
  
  // Get only the Bookmarks Bar (id "1")
  const bookmarks = await new Promise(resolve => {
    chrome.bookmarks.getSubTree('1', function(bookmarkBar) {
      if (bookmarkBar && bookmarkBar.length > 0) {
        resolve(bookmarkBar);
      } else {
        resolve([]);
      }
    });
  });
  
  // Build API URL
  const repoParts = gitConfig.repo.match(/https:\/\/(.*)\/(.*)\/(.*)\.git/);
  if (!repoParts) {
    alert('Git repository URL format is incorrect');
    return;
  }
  
  const [, domain, owner, repo] = repoParts;
  const apiUrl = `https://${domain}/api/v5/repos/${owner}/${repo}/contents/${gitConfig.filePath}`;
  
  try {
    let sha = null;
    
    if (!force) {
      // Check if file exists
      const checkResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${gitConfig.token}`
        }
      });
      
      if (checkResponse.ok) {
        const fileData = await checkResponse.json();
        sha = fileData.sha;
      }
    }
    
    // 准备文件内容
    const jsonString = JSON.stringify(bookmarks, null, 2);
    // 使用一个更简单、更可靠的方法来处理UTF-8字符
    const content = btoa(unescape(encodeURIComponent(jsonString)));
    const payload = {
      message: force ? 'Force sync bookmarks' : 'Sync bookmarks',
      content: content
    };
    
    if (sha && !force) {
      payload.sha = sha;
    }
    
    // Send request
    // For force sync, always use POST to overwrite
    const method = (sha && !force) ? 'PUT' : 'POST';
    const response = await fetch(apiUrl, {
      method: method,
      headers: {
        'Authorization': `token ${gitConfig.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      // Sync successful
      const responseData = await response.json();
      const remoteSha = responseData.sha;
      
      // Calculate local hash using SHA-1 for more efficient storage
      // Remove dynamic fields to ensure consistent hashing
      const cleanedBookmarks = removeDynamicFields(bookmarks);
      const localJson = JSON.stringify(cleanedBookmarks, null, 2);
      const localHash = await sha1Hash(localJson);
      
      // Update sync status
      const newSyncStatus = {
        lastSyncTime: new Date().toISOString(),
        lastSyncHash: localHash,
        lastSyncSha: remoteSha
      };
      
      chrome.storage.sync.set({ [SYNC_STATUS_KEY]: newSyncStatus });
      
      // Refresh sync status display
      checkSyncStatus();
    } else {
      const error = await response.json();
      console.error('Sync failed:', error.message || 'Unknown error');
    }
  } catch (error) {
    console.error('Sync failed:', error.message);
  }
}

// Sync from Git repository
async function syncFromGit() {
  // Get Git configuration
  const gitConfig = await new Promise(resolve => {
    chrome.storage.sync.get(GIT_CONFIG_KEY, function(data) {
      resolve(data[GIT_CONFIG_KEY] || {});
    });
  });
  
  if (!gitConfig.repo || !gitConfig.token || !gitConfig.filePath) {
    alert('Please fill in complete Git configuration information');
    return;
  }
  
  // Build API URL
  const repoParts = gitConfig.repo.match(/https:\/\/(.*)\/(.*)\/(.*)\.git/);
  if (!repoParts) {
    alert('Git repository URL format is incorrect');
    return;
  }
  
  const [, domain, owner, repo] = repoParts;
  const apiUrl = `https://${domain}/api/v5/repos/${owner}/${repo}/contents/${gitConfig.filePath}`;
  
  try {
    // Send request
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${gitConfig.token}`
      }
    });
    
    if (response.ok) {
      const fileData = await response.json();
      // 使用相应的解码方法来匹配编码过程
      const content = decodeURIComponent(escape(atob(fileData.content)));
      const bookmarks = JSON.parse(content);
      
      // Clear existing bookmarks in Bookmarks Bar
      chrome.bookmarks.getSubTree('1', function(bookmarkBar) {
        if (bookmarkBar && bookmarkBar.length > 0) {
          const bookmarksBarNode = bookmarkBar[0];
          // Remove all children from Bookmarks Bar
          if (bookmarksBarNode.children) {
            bookmarksBarNode.children.forEach(function(child) {
              chrome.bookmarks.removeTree(child.id);
            });
          }
        }
        
        // Import bookmarks to Bookmarks Bar
        importBookmarks(bookmarks[0].children, '1'); // Import to Bookmarks Bar
        
        // Refresh favorites
        loadFavorites();
        
        // Calculate local hash using SHA-1 for more efficient storage
        // Remove dynamic fields to ensure consistent hashing
        const cleanedBookmarks = removeDynamicFields(bookmarks);
        const localJson = JSON.stringify(cleanedBookmarks, null, 2);
        crypto.subtle.digest('SHA-1', new TextEncoder().encode(localJson))
          .then(hashBuffer => {
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const localHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // Update sync status
            const newSyncStatus = {
              lastSyncTime: new Date().toISOString(),
              lastSyncHash: localHash,
              lastSyncSha: fileData.sha
            };
            
            chrome.storage.sync.set({ [SYNC_STATUS_KEY]: newSyncStatus });
            
            // Refresh sync status display
            checkSyncStatus();
          });
      });
    } else {
      const error = await response.json();
      console.error('Sync failed:', error.message || 'Unknown error');
    }
  } catch (error) {
    console.error('Sync failed:', error.message);
  }
}

// Import bookmarks recursively
function importBookmarks(bookmarksToImport, parentId) {
  bookmarksToImport.forEach(function(bookmark) {
    if (bookmark.children) {
      // Create folder
      chrome.bookmarks.create({
        parentId: parentId,
        title: bookmark.title
      }, function(folder) {
        // Import children
        importBookmarks(bookmark.children, folder.id);
      });
    } else {
      // Create bookmark
      chrome.bookmarks.create({
        parentId: parentId,
        title: bookmark.title,
        url: bookmark.url
      });
    }
  });
}
