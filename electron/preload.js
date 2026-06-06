import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, callback) => {
    const subscription = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  // Projects
  projectsList:        ()     => ipcRenderer.invoke('projects:list'),
  projectsCreate:      (data) => ipcRenderer.invoke('projects:create', data),
  projectsUpdate:      (data) => ipcRenderer.invoke('projects:update', data),
  projectsEnsureByRootPath: (data) => ipcRenderer.invoke('projects:ensureByRootPath', data),
  projectsGetActive:   ()     => ipcRenderer.invoke('projects:getActive'),
  projectsSetActive:   (id)   => ipcRenderer.invoke('projects:setActive', id),
  projectsDelete:      (data) => ipcRenderer.invoke('projects:delete', data),
  projectsUpdatePhase: (data) => ipcRenderer.invoke('projects:updatePhase', data),
  subprojectsList:     (projectId) => ipcRenderer.invoke('subprojects:list', projectId),
  subprojectsEnsure:   (data) => ipcRenderer.invoke('subprojects:ensure', data),
  subprojectsUpdatePhase: (data) => ipcRenderer.invoke('subprojects:updatePhase', data),
  // Kanban
  kanbanGetColumns: () => ipcRenderer.invoke('kanban:getColumns'),
  // File ops
  folderBrowse:       ()     => ipcRenderer.invoke('folder:browse'),
  fsListFolders:      (data) => ipcRenderer.invoke('fs:listFolders', data),
  fsScanDir:          (data) => ipcRenderer.invoke('fs:scanDir', data),
  fsFindEntryByIdentity: (data) => ipcRenderer.invoke('fs:findEntryByIdentity', data),
  fsFindEntriesByIdentity: (data) => ipcRenderer.invoke('fs:findEntriesByIdentity', data),
  fsCreateFolder:     (data) => ipcRenderer.invoke('fs:createFolder', data),
  fsRenameFolder:     (data) => ipcRenderer.invoke('fs:renameFolder', data),
  fsOpenInExplorer:   (data) => ipcRenderer.invoke('fs:openInExplorer', data),
  fsMoveFile:         (data) => ipcRenderer.invoke('fs:moveFile', data),
  fsSearchFiles:      (data) => ipcRenderer.invoke('fs:searchFiles', data),
  fsSaveSummaryDoc:   (data) => ipcRenderer.invoke('fs:saveSummaryDoc', data),
  fsExportTextFile:   (data) => ipcRenderer.invoke('fs:exportTextFile', data),
  fsStatFile:         (data) => ipcRenderer.invoke('fs:statFile', data),
  fsShowInExplorer:   (data) => ipcRenderer.invoke('fs:showInExplorer', data),
  fsQuickFile:        (data) => ipcRenderer.invoke('fs:quickFile', data),
  fsCopyFile:         (data) => ipcRenderer.invoke('fs:copyFile', data),
  systemBrowseFile:   ()     => ipcRenderer.invoke('system:browseFile'),
  systemOpenPath:     (data) => ipcRenderer.invoke('system:openPath', data),
  shellOpenExternal:  (data) => ipcRenderer.invoke('shell:openExternal', data),
  // Document control
  documentsOpenWindow:  ()     => ipcRenderer.invoke('documents:openWindow'),
  documentsCloseWindow: ()     => ipcRenderer.invoke('documents:closeWindow'),
  documentsIsWindowOpen:()     => ipcRenderer.invoke('documents:isWindowOpen'),
  documentsIndexProject: (data) => ipcRenderer.invoke('documents:indexProject', data),
  documentsList:         (data) => ipcRenderer.invoke('documents:list', data),
  documentsGet:          (data) => ipcRenderer.invoke('documents:get', data),
  intakeImportFromDialog:(data) => ipcRenderer.invoke('intake:importFromDialog', data),
  intakeImportPaths:     (data) => ipcRenderer.invoke('intake:importPaths', data),
  searchQuery:           (data) => ipcRenderer.invoke('search:query', data),
  extractionExtractDocument: (data) => ipcRenderer.invoke('extraction:extractDocument', data),
  checklistsGetForDocument: (data) => ipcRenderer.invoke('checklists:getForDocument', data),
  checklistsToggleItem:  (data) => ipcRenderer.invoke('checklists:toggleItem', data),
  commentsList:          (data) => ipcRenderer.invoke('comments:list', data),
  commentsCreate:        (data) => ipcRenderer.invoke('comments:create', data),
  commentsResolve:       (data) => ipcRenderer.invoke('comments:resolve', data),
  savedViewsList:        (data) => ipcRenderer.invoke('savedViews:list', data),
  savedViewsUpsert:      (data) => ipcRenderer.invoke('savedViews:upsert', data),
  standardsCheckDocument:(data) => ipcRenderer.invoke('standards:checkDocument', data),
  briefsGenerate:        (data) => ipcRenderer.invoke('briefs:generate', data),
  briefsLatest:          (data) => ipcRenderer.invoke('briefs:latest', data),
  backupCreate:          (data) => ipcRenderer.invoke('backup:create', data),
  backupCreateRecoverySnapshot: (data) => ipcRenderer.invoke('backup:createRecoverySnapshot', data),
  backupListRecoverySnapshots: () => ipcRenderer.invoke('backup:listRecoverySnapshots'),
  backupLoadRecoverySnapshot: (data) => ipcRenderer.invoke('backup:loadRecoverySnapshot', data),
  // Launcher
  launcherOpen: (data) => ipcRenderer.invoke('launcher:open', data),
  // Filing
  filingCreateFolder: (data) => ipcRenderer.invoke('filing:createFolder', data),
  // Gemini
  geminiGetLastResult:     () =>       ipcRenderer.invoke('gemini:getLastResult'),
  geminiRunManual:         () =>       ipcRenderer.invoke('gemini:runManual'),
  geminiAnalyseDocument: (data) =>   ipcRenderer.invoke('gemini:analyseDocument', data),
  // Canvas
  canvasLoad:        (data) => ipcRenderer.invoke('canvas:load', data),
  canvasSave:        (data) => ipcRenderer.invoke('canvas:save', data),
  canvasExportImage: (data) => ipcRenderer.invoke('canvas:exportImage', data),
  // Templates
  templatesList:      ()     => ipcRenderer.invoke('templates:list'),
  templatesUpsert:    (data) => ipcRenderer.invoke('templates:upsert', data),
  templatesDelete:    (data) => ipcRenderer.invoke('templates:delete', data),
  templatesBrowse:    ()     => ipcRenderer.invoke('templates:browseFile'),
  templatesOpenFile:  (data) => ipcRenderer.invoke('templates:openFile', data),
  // Outgoing log
  outgoingList: (data) => ipcRenderer.invoke('outgoing:list', data),
  // Report
  reportGenerate: (data) => ipcRenderer.invoke('report:generate', data),
  // Settings
  settingsGetAll:          ()     => ipcRenderer.invoke('settings:getAll'),
  settingsUpdatePrompt:    (data) => ipcRenderer.invoke('settings:updatePrompt', data),
  settingsUpdateDocPrompt: (data) => ipcRenderer.invoke('settings:updateDocPrompt', data),
  settingsGetTemplateFiles:    ()     => ipcRenderer.invoke('settings:getTemplateFiles'),
  settingsUpdateTemplateFiles: (data) => ipcRenderer.invoke('settings:updateTemplateFiles', data),
  settingsUpdateApiKey:    (data) => ipcRenderer.invoke('settings:updateApiKey', data),
  settingsUpsertRule:  (data) => ipcRenderer.invoke('settings:upsertRule', data),
  settingsDeleteRule:  (data) => ipcRenderer.invoke('settings:deleteRule', data),
  settingsGetProjectInfoLists: () => ipcRenderer.invoke('settings:getProjectInfoLists'),
  settingsUpdateProjectInfoLists: (data) => ipcRenderer.invoke('settings:updateProjectInfoLists', data),
  settingsUpdateSidePanelVisibility: (data) => ipcRenderer.invoke('settings:updateSidePanelVisibility', data),
  settingsUpdateRecoveryBackupInterval: (data) => ipcRenderer.invoke('settings:updateRecoveryBackupInterval', data),
  settingsUpsertPath:  (data) => ipcRenderer.invoke('settings:upsertPath', data),
  settingsVerifyPath:  (data) => ipcRenderer.invoke('settings:verifyPath', data),
  // View
  viewGetHiddenExtensions: () => ipcRenderer.invoke('view:getHiddenExtensions'),
  // Dashboard windows
  dashboardOpenBoxWindow: (data) => ipcRenderer.invoke('dashboard:openBoxWindow', data),
}

contextBridge.exposeInMainWorld('api', api)
