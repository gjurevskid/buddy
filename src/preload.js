const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  getInitState: () => ipcRenderer.invoke('get-init-state'),
  setApiKey: (provider, key) => ipcRenderer.invoke('set-api-key', { provider, key }),
  setActiveProvider: (provider) => ipcRenderer.invoke('set-active-provider', provider),
  sendMessage: (text) => ipcRenderer.invoke('send-message', text),
  setCharacter: (id) => ipcRenderer.invoke('set-character', id),
  setPetName: (name) => ipcRenderer.invoke('set-pet-name', name),
  setUserName: (name) => ipcRenderer.invoke('set-user-name', name),
  setVoiceEnabled: (enabled) => ipcRenderer.invoke('set-voice-enabled', enabled),
  petThePet: () => ipcRenderer.invoke('pet-pet'),
  feedPet: () => ipcRenderer.invoke('feed-pet'),
  notifyUserActive: () => ipcRenderer.send('user-active'),

  toggleChat: () => ipcRenderer.send('toggle-chat'),
  closeChat: () => ipcRenderer.send('close-chat'),

  petDragStart: () => ipcRenderer.send('pet-drag-start'),
  petDragMove: (dx, dy) => ipcRenderer.send('pet-drag-move', { dx, dy }),
  petDragEnd: () => ipcRenderer.send('pet-drag-end'),

  onPetUpdate: (callback) => {
    ipcRenderer.on('pet-update', (_evt, payload) => callback(payload));
  },
  onPetAction: (callback) => {
    ipcRenderer.on('pet-action', (_evt, payload) => callback(payload));
  },
  onMoodChanged: (callback) => {
    ipcRenderer.on('mood-changed', (_evt, payload) => callback(payload));
  },
  onBondChanged: (callback) => {
    ipcRenderer.on('bond-changed', (_evt, payload) => callback(payload));
  },
  onCharacterChanged: (callback) => {
    ipcRenderer.on('character-changed', (_evt, id) => callback(id));
  },
  onBuddySays: (callback) => {
    ipcRenderer.on('buddy-says', (_evt, payload) => callback(payload));
  },
  onBuddyEvolved: (callback) => {
    ipcRenderer.on('buddy-evolved', (_evt, payload) => callback(payload));
  },
  onVoiceChanged: (callback) => {
    ipcRenderer.on('voice-changed', (_evt, enabled) => callback(enabled));
  }
});
