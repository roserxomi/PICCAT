class SaacApp {
    constructor() {
        this.categories = this.loadFromStorage('categories') || [];
        this.pictos = this.loadFromStorage('pictos') || [];
        this.currentCategory = 'all';
        this.editingCategory = null;
        this.editingPicto = null;
        this.longPressTimer = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.lastAudioPlay = 0;
        this.audioCooldown = 300; // Reduir cooldown
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderCategories();
        this.renderPictos();
        this.setupColorPickers();
    }

    // Gestión de almacenamiento local
    saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.warn('Quota de localStorage excedida. Netejant dades...');
                this.clearOldData();
                
                localStorage.setItem(key, JSON.stringify(data));
            } else {
                console.error('Error guardant a localStorage:', error);
            }
        }
    }
    
    clearOldData() {
        // Netejar altres dades temporals si hi haguessin
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('temp_') || key.startsWith('cache_'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    loadFromStorage(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    }

    // Eventos
    bindEvents() {
        // Botón "Tots"
        document.getElementById('all-categories-btn').addEventListener('click', () => {
            this.setActiveCategory('all');
        });

        // Botón añadir categoría
        document.getElementById('add-category-btn').addEventListener('click', () => {
            this.showNewCategoryModal();
        });

        // Botón añadir picto
        document.getElementById('add-picto-btn').addEventListener('click', () => {
            this.showPictoModal();
        });

        

        // Modal de categoría
        document.getElementById('save-category-btn').addEventListener('click', () => {
            this.saveCategory();
        });

        document.getElementById('delete-category-btn').addEventListener('click', () => {
            this.deleteCategory();
        });

        document.getElementById('cancel-category-btn').addEventListener('click', () => {
            this.hideModal('category-modal');
        });

        // Modal de nueva categoría
        document.getElementById('create-category-btn').addEventListener('click', () => {
            this.createCategory();
        });

        document.getElementById('cancel-new-category-btn').addEventListener('click', () => {
            this.hideModal('new-category-modal');
        });

        // Modal de picto
        document.getElementById('save-picto-btn').addEventListener('click', () => {
            this.savePicto();
        });

        document.getElementById('delete-picto-btn').addEventListener('click', () => {
            this.deletePicto();
        });

        document.getElementById('cancel-picto-btn').addEventListener('click', () => {
            this.hideModal('picto-modal');
        });

        // Input de imagen
        document.getElementById('picto-image-input').addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });

        // Botones de audio
        document.getElementById('record-audio-btn').addEventListener('click', () => {
            this.toggleRecording();
        });

        document.getElementById('use-tts-btn').addEventListener('click', () => {
            this.useTTS();
        });

        // Cerrar modals al hacer clic fuera
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideModal(e.target.id);
            }
        });
    }

    // Gestión de categorías
    createCategory() {
        const name = document.getElementById('new-category-name-input').value.trim();
        const selectedColor = document.querySelector('#new-color-picker .color-option.selected');
        
        if (!name) {
            alert('Introdueix un nom per la categoria');
            return;
        }

        if (!selectedColor) {
            alert('Selecciona un color per la categoria');
            return;
        }

        const category = {
            id: Date.now().toString(),
            name: name,
            color: selectedColor.dataset.color
        };

        this.categories.push(category);
        this.saveToStorage('categories', this.categories);
        this.renderCategories();
        this.updatePictoCategorySelect();
        this.hideModal('new-category-modal');
        
        // Limpiar inputs
        document.getElementById('new-category-name-input').value = '';
        document.querySelectorAll('#new-color-picker .color-option').forEach(option => {
            option.classList.remove('selected');
        });
    }

    saveCategory() {
        if (!this.editingCategory) return;

        const name = document.getElementById('category-name-input').value.trim();
        const selectedColor = document.querySelector('#color-picker .color-option.selected');

        if (!name) {
            alert('Introdueix un nom per la categoria');
            return;
        }

        if (!selectedColor) {
            alert('Selecciona un color per la categoria');
            return;
        }

        this.editingCategory.name = name;
        this.editingCategory.color = selectedColor.dataset.color;

        this.saveToStorage('categories', this.categories);
        this.renderCategories();
        this.renderPictos();
        this.hideModal('category-modal');
    }

    deleteCategory() {
        if (!this.editingCategory) return;

        if (confirm(`Estàs segur que vols eliminar la categoria "${this.editingCategory.name}"?`)) {
            // Eliminar pictos de esta categoría
            this.pictos = this.pictos.filter(picto => picto.categoryId !== this.editingCategory.id);
            
            // Eliminar categoría
            this.categories = this.categories.filter(cat => cat.id !== this.editingCategory.id);
            
            this.saveToStorage('categories', this.categories);
            this.saveToStorage('pictos', this.pictos);
            
            this.renderCategories();
            this.renderPictos();
            this.hideModal('category-modal');
            
            if (this.currentCategory === this.editingCategory.id) {
                this.setActiveCategory('all');
            }
        }
    }

    setActiveCategory(categoryId) {
        this.currentCategory = categoryId;
        this.renderPictos();
        
        // Actualizar estado visual de categorías
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (categoryId === 'all') {
            document.getElementById('all-categories-btn').classList.add('active');
        } else {
            const categoryBtn = document.querySelector(`[data-category-id="${categoryId}"]`);
            if (categoryBtn) {
                categoryBtn.classList.add('active');
            }
        }
    }

    // Gestión de pictos
    addPictoToHistory(picto) {
        // Només reproduir àudio, sense historial
        this.playPictoAudio(picto);
    }

    playPictoAudio(picto) {
        try {
            // Parar qualsevol síntesi de veu anterior
            if (window.speechSynthesis && window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
            }
            
            if (picto.audioType === 'recorded' && picto.audioData) {
                try {
                    const audio = new Audio(picto.audioData);
                    audio.volume = 1.0;
                    audio.preload = 'auto';
                    
                    // Gestió d'events per Android
                    audio.addEventListener('canplaythrough', () => {
                        audio.play().catch(err => {
                            console.warn('Error reproduint àudio gravat:', err);
                            this.speakText(picto.name);
                        });
                    });
                    
                    audio.addEventListener('error', () => {
                        console.warn('Error carregant àudio');
                        this.speakText(picto.name);
                    });
                    
                    // Intentar reproduir directament
                    audio.play().catch(() => {
                        this.speakText(picto.name);
                    });
                } catch (error) {
                    this.speakText(picto.name);
                }
            } else {
                // Usar TTS per defecte
                this.speakText(picto.name);
            }
        } catch (error) {
            console.warn('Error reproduint àudio:', error);
        }
    }

    speakText(text) {
        if ('speechSynthesis' in window && text) {
            try {
                console.log('TTS iniciat');
                
                // Parar qualsevol síntesi anterior
                if (speechSynthesis.speaking) {
                    speechSynthesis.cancel();
                }
                
                const speak = () => {
                    try {
                        const utterance = new SpeechSynthesisUtterance(text);
                        
                        // Configuració més compatible per móviles
                        utterance.lang = 'ca-ES';
                        utterance.rate = 0.8;
                        utterance.volume = 1.0;
                        utterance.pitch = 1.0;
                        
                        utterance.onstart = () => {
                            console.log('TTS començat');
                        };
                        
                        utterance.onend = () => {
                            console.log('TTS completat');
                        };
                        
                        utterance.onerror = (event) => {
                            console.warn('Error TTS:', event.error);
                            // Fallback: mostrar text si falla TTS
                            if (event.error !== 'interrupted') {
                                this.showTextFeedback(text);
                            }
                        };
                        
                        // Usar setTimeout per evitar problemes en algunos navegadors
                        setTimeout(() => {
                            if (speechSynthesis && !speechSynthesis.speaking) {
                                speechSynthesis.speak(utterance);
                            }
                        }, 50);
                        
                    } catch (speechError) {
                        console.warn('Error creant utterance:', speechError);
                        this.showTextFeedback(text);
                    }
                };
                
                // Esperar a que les veus estiguin disponibles
                if (speechSynthesis.getVoices().length === 0) {
                    let voicesLoaded = false;
                    const loadVoices = () => {
                        if (!voicesLoaded) {
                            voicesLoaded = true;
                            speak();
                        }
                    };
                    
                    speechSynthesis.addEventListener('voiceschanged', loadVoices, { once: true });
                    // Fallback per si l'event no es dispara
                    setTimeout(loadVoices, 500);
                } else {
                    speak();
                }
                
            } catch (error) {
                console.warn('Error TTS:', error);
                this.showTextFeedback(text);
            }
        } else {
            this.showTextFeedback(text);
        }
    }
    
    showTextFeedback(text) {
        // Mostrar feedback visual quan TTS no funciona
        const feedback = document.createElement('div');
        feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(52, 73, 94, 0.9);
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: bold;
            z-index: 1000;
            pointer-events: none;
        `;
        feedback.textContent = text;
        document.body.appendChild(feedback);
        
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }, 2000);
    }

    savePicto() {
        const name = document.getElementById('picto-name-input').value.trim();
        const categoryId = document.getElementById('picto-category-select').value;
        const imageData = document.getElementById('picto-preview').src;

        if (!name) {
            alert('Introdueix un nom per el picto');
            return;
        }

        if (!categoryId) {
            alert('Selecciona una categoria');
            return;
        }

        if (!imageData || imageData === window.location.href) {
            alert('Selecciona una imatge');
            return;
        }

        const pictoData = {
            name: name,
            categoryId: categoryId,
            imageData: imageData,
            audioType: this.currentAudioType || 'tts',
            audioData: this.currentAudioData || null
        };

        if (this.editingPicto) {
            // Editar picto existente
            Object.assign(this.editingPicto, pictoData);
        } else {
            // Crear nuevo picto
            pictoData.id = Date.now().toString();
            this.pictos.push(pictoData);
        }

        this.saveToStorage('pictos', this.pictos);
        this.renderPictos();
        this.hideModal('picto-modal');
        this.resetPictoModal();
    }

    deletePicto() {
        if (!this.editingPicto) return;

        if (confirm(`Estàs segur que vols eliminar el picto "${this.editingPicto.name}"?`)) {
            this.pictos = this.pictos.filter(picto => picto.id !== this.editingPicto.id);
            this.saveToStorage('pictos', this.pictos);
            this.renderPictos();
            this.hideModal('picto-modal');
        }
    }

    

    // Gestión de audio
    async toggleRecording() {
        const button = document.getElementById('record-audio-btn');
        
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            // Parar grabación
            this.mediaRecorder.stop();
            button.textContent = 'Gravar Audio';
            button.style.background = '#3498db';
        } else {
            // Iniciar grabación
            try {
                // Configuració específica per Android
                const constraints = {
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 22050, // Reduir per millor compatibilitat
                        channelCount: 1
                    }
                };
                
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                
                // Trobar el millor format compatible
                let options = {};
                const supportedTypes = [
                    'audio/webm;codecs=opus',
                    'audio/webm',
                    'audio/mp4',
                    'audio/mpeg',
                    'audio/wav'
                ];
                
                for (const type of supportedTypes) {
                    if (MediaRecorder.isTypeSupported(type)) {
                        options.mimeType = type;
                        console.log('Usant format:', type);
                        break;
                    }
                }
                
                this.mediaRecorder = new MediaRecorder(stream, options);
                this.audioChunks = [];

                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        this.audioChunks.push(event.data);
                    }
                };

                this.mediaRecorder.onstop = () => {
                    const mimeType = this.mediaRecorder.mimeType || 'audio/wav';
                    const audioBlob = new Blob(this.audioChunks, { type: mimeType });
                    
                    // Convertir a base64 per millor compatibilitat
                    const reader = new FileReader();
                    reader.onload = () => {
                        this.currentAudioType = 'recorded';
                        this.currentAudioData = reader.result;
                        
                        const audioPreview = document.getElementById('audio-preview');
                        audioPreview.src = reader.result;
                        audioPreview.style.display = 'block';
                    };
                    reader.readAsDataURL(audioBlob);
                    
                    // Parar todas las pistas de audio
                    stream.getTracks().forEach(track => track.stop());
                };

                this.mediaRecorder.onerror = (event) => {
                    console.error('Error de gravació:', event);
                    alert('Error durant la gravació');
                    stream.getTracks().forEach(track => track.stop());
                };

                this.mediaRecorder.start(1000); // Gravar en chunks de 1s
                button.textContent = 'Parar Gravació';
                button.style.background = '#e74c3c';
            } catch (error) {
                console.error('Error accedint al micròfon:', error);
                if (error.name === 'NotAllowedError') {
                    alert('Cal donar permisos de micròfon per gravar àudio');
                } else if (error.name === 'NotFoundError') {
                    alert('No s\'ha trobat cap micròfon');
                } else {
                    alert('Error accedint al micròfon: ' + error.message);
                }
            }
        }
    }

    useTTS() {
        this.currentAudioType = 'tts';
        this.currentAudioData = null;
        
        const audioPreview = document.getElementById('audio-preview');
        audioPreview.style.display = 'none';
        
        alert('Text-a-veu seleccionat. El nom del picto es llegirà automàticament.');
    }

    // Gestión de imágenes
    handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('picto-preview').src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    // Renderizado
    renderCategories() {
        const container = document.getElementById('categories-container');
        container.innerHTML = '';

        this.categories.forEach(category => {
            const categoryContainer = document.createElement('div');
            categoryContainer.className = 'category-container';

            const button = document.createElement('button');
            button.className = 'category-btn';
            button.style.backgroundColor = category.color;
            button.textContent = category.name;
            button.dataset.categoryId = category.id;

            // Icono de editar para categoría
            const editIcon = document.createElement('div');
            editIcon.className = 'category-edit-icon';
            editIcon.innerHTML = '✏️';
            editIcon.title = 'Editar categoria';

            categoryContainer.appendChild(button);
            categoryContainer.appendChild(editIcon);

            // Click en el icono de editar
            editIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editCategory(category);
            });

            // Touch events para móviles
            editIcon.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                e.preventDefault();
            });

            editIcon.addEventListener('touchend', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.editCategory(category);
            });

            // Click normal
            button.addEventListener('click', () => {
                this.setActiveCategory(category.id);
            });

            // Long press
            button.addEventListener('mousedown', () => {
                this.longPressTimer = setTimeout(() => {
                    this.editCategory(category);
                }, 3000);
            });

            button.addEventListener('mouseup', () => {
                clearTimeout(this.longPressTimer);
            });

            button.addEventListener('mouseleave', () => {
                clearTimeout(this.longPressTimer);
            });

            container.appendChild(categoryContainer);
        });

        this.updatePictoCategorySelect();
    }

    renderPictos() {
        const container = document.getElementById('pictos-container');
        container.innerHTML = '';

        let filteredPictos = this.pictos;
        if (this.currentCategory !== 'all') {
            filteredPictos = this.pictos.filter(picto => picto.categoryId === this.currentCategory);
        }

        if (this.currentCategory === 'all') {
            // Agrupar por categorías
            const groupedPictos = {};
            filteredPictos.forEach(picto => {
                const category = this.categories.find(cat => cat.id === picto.categoryId);
                const categoryName = category ? category.name : 'Sense categoria';
                if (!groupedPictos[categoryName]) {
                    groupedPictos[categoryName] = [];
                }
                groupedPictos[categoryName].push(picto);
            });

            Object.keys(groupedPictos).forEach(categoryName => {
                if (groupedPictos[categoryName].length > 0) {
                    const categoryTitle = document.createElement('h3');
                    categoryTitle.textContent = categoryName;
                    categoryTitle.style.gridColumn = '1 / -1';
                    categoryTitle.style.color = 'white';
                    categoryTitle.style.marginTop = '20px';
                    categoryTitle.style.marginBottom = '10px';
                    container.appendChild(categoryTitle);

                    groupedPictos[categoryName].forEach(picto => {
                        container.appendChild(this.createPictoElement(picto));
                    });
                }
            });
        } else {
            filteredPictos.forEach(picto => {
                container.appendChild(this.createPictoElement(picto));
            });
        }
    }

    createPictoElement(picto) {
        const category = this.categories.find(cat => cat.id === picto.categoryId);
        const pictoEl = document.createElement('div');
        pictoEl.className = 'picto';
        pictoEl.style.borderColor = category ? category.color : '#7f8c8d';

        const img = document.createElement('img');
        img.src = picto.imageData;
        img.alt = picto.name;

        const name = document.createElement('div');
        name.className = 'picto-name';
        name.textContent = picto.name;

        // Icono de editar
        const editIcon = document.createElement('div');
        editIcon.className = 'edit-icon';
        editIcon.innerHTML = '✏️';
        editIcon.title = 'Editar picto';

        pictoEl.appendChild(img);
        pictoEl.appendChild(name);
        pictoEl.appendChild(editIcon);

        // Click en el icono de editar
        editIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editPicto(picto);
        });

        // Touch events para móviles en el icono de editar
        editIcon.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });

        editIcon.addEventListener('touchend', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.editPicto(picto);
        });

        // Click normal - reproduir àudio sempre
        pictoEl.addEventListener('click', (e) => {
            e.preventDefault();
            const now = Date.now();
            if (now - this.lastAudioPlay > this.audioCooldown) {
                this.lastAudioPlay = now;
                console.log('Click al picto:', picto.name);
                this.addPictoToHistory(picto);
            } else {
                console.log('Click ignorat per cooldown');
            }
        });

        // Touch events per móviles
        pictoEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.longPressTimer = setTimeout(() => {
                this.editPicto(picto);
            }, 3000);
        });

        pictoEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                // Si no ha sido long press, reproducir audio
                const now = Date.now();
                if (now - this.lastAudioPlay > this.audioCooldown) {
                    this.lastAudioPlay = now;
                    console.log('Touch al picto:', picto.name);
                    this.addPictoToHistory(picto);
                }
            }
        });

        pictoEl.addEventListener('touchcancel', () => {
            clearTimeout(this.longPressTimer);
        });

        // Long press - editar (mantenemos mouse events para escritorio)
        pictoEl.addEventListener('mousedown', () => {
            this.longPressTimer = setTimeout(() => {
                this.editPicto(picto);
            }, 3000);
        });

        pictoEl.addEventListener('mouseup', () => {
            clearTimeout(this.longPressTimer);
        });

        pictoEl.addEventListener('mouseleave', () => {
            clearTimeout(this.longPressTimer);
        });

        return pictoEl;
    }

    

    // Modals
    showNewCategoryModal() {
        document.getElementById('new-category-modal').style.display = 'block';
    }

    editCategory(category) {
        this.editingCategory = category;
        document.getElementById('category-name-input').value = category.name;
        
        // Seleccionar color actual
        document.querySelectorAll('#color-picker .color-option').forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.color === category.color) {
                option.classList.add('selected');
            }
        });

        document.getElementById('category-modal').style.display = 'block';
    }

    showPictoModal() {
        this.editingPicto = null;
        this.resetPictoModal();
        document.getElementById('picto-modal').style.display = 'block';
    }

    editPicto(picto) {
        this.editingPicto = picto;
        document.getElementById('picto-name-input').value = picto.name;
        document.getElementById('picto-preview').src = picto.imageData;
        document.getElementById('picto-category-select').value = picto.categoryId;
        
        this.currentAudioType = picto.audioType;
        this.currentAudioData = picto.audioData;
        
        if (picto.audioType === 'recorded' && picto.audioData) {
            const audioPreview = document.getElementById('audio-preview');
            audioPreview.src = picto.audioData;
            audioPreview.style.display = 'block';
        }

        document.getElementById('picto-modal').style.display = 'block';
    }

    resetPictoModal() {
        document.getElementById('picto-name-input').value = '';
        document.getElementById('picto-preview').src = '';
        document.getElementById('picto-image-input').value = '';
        document.getElementById('audio-preview').style.display = 'none';
        this.currentAudioType = 'tts';
        this.currentAudioData = null;
    }

    hideModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
        this.editingCategory = null;
        this.editingPicto = null;
    }

    setupColorPickers() {
        // Color picker para editar categoría
        document.querySelectorAll('#color-picker .color-option').forEach(option => {
            option.style.backgroundColor = option.dataset.color;
            option.addEventListener('click', () => {
                document.querySelectorAll('#color-picker .color-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                option.classList.add('selected');
            });
        });

        // Color picker para nueva categoría
        document.querySelectorAll('#new-color-picker .color-option').forEach(option => {
            option.style.backgroundColor = option.dataset.color;
            option.addEventListener('click', () => {
                document.querySelectorAll('#new-color-picker .color-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                option.classList.add('selected');
            });
        });
    }

    updatePictoCategorySelect() {
        const select = document.getElementById('picto-category-select');
        select.innerHTML = '<option value="">Selecciona una categoria</option>';
        
        this.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new SaacApp();
});