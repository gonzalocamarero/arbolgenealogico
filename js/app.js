/**
 * App: Controlador principal de la aplicación del Árbol Genealógico.
 * Gestiona el estado de los datos, el almacenamiento en LocalStorage,
 * los modales de edición/adición, la importación/exportación JSON y la UI.
 */

class GenealogyApp {
  constructor() {
    this.storageKey = 'arbol_genealogico_db_v3';
    this.treeData = null;
    this.selectedPersonId = null;
    this.editingPersonId = null;
    this.quickAddContext = null;
    this.activeView = 'tree'; // 'tree' | 'list'

    this.init();
  }

  init() {
    // 1. Cargar datos (LocalStorage o predeterminados)
    this.loadInitialData();

    // 2. Inicializar renderizador de árbol
    this.treeRenderer = new TreeRenderer('treeContainerWrapper');
    this.treeRenderer.setData(this.treeData);
    this.treeRenderer.resetView();

    // 3. Inicializar escuchadores de eventos
    this.bindEvents();
    this.updateStats();
    this.renderDirectoryList();
  }

  loadInitialData() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        this.treeData = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Error al leer LocalStorage, usando datos por defecto:', e);
    }

    if (!this.treeData || !Array.isArray(this.treeData.personas)) {
      // Usar clon de DEFAULT_TREE_DATA definido en data.js
      this.treeData = JSON.parse(JSON.stringify(DEFAULT_TREE_DATA));
      this.saveToLocalStorage();
    }
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.treeData));
      this.showToast('Cambios guardados localmente');
    } catch (e) {
      console.error('Error guardando en LocalStorage:', e);
    }
  }

  bindEvents() {
    // Escuchar eventos emitidos por el árbol
    window.addEventListener('person-select', (e) => {
      this.openDetailDrawer(e.detail.id);
    });

    window.addEventListener('person-edit', (e) => {
      this.openEditModal(e.detail.id);
    });

    window.addEventListener('quick-add', (e) => {
      this.handleQuickAdd(e.detail);
    });

    // Barra superior y controles de vista
    document.getElementById('btnModePedigree').addEventListener('click', (e) => {
      this.setTreeViewMode('pedigree', e.target);
    });

    document.getElementById('btnModeDescendants').addEventListener('click', (e) => {
      this.setTreeViewMode('descendants', e.target);
    });

    document.getElementById('btnViewDirectory').addEventListener('click', () => {
      this.toggleDirectoryView();
    });

    // Zoom y centrado
    document.getElementById('btnZoomIn').addEventListener('click', () => this.treeRenderer.zoomIn());
    document.getElementById('btnZoomOut').addEventListener('click', () => this.treeRenderer.zoomOut());
    document.getElementById('btnResetZoom').addEventListener('click', () => this.treeRenderer.resetView());

    // Alternar expansión del árbol genealógico completo (antepasados, hermanos, cónyuges e hijos)
    const updateFullTreeBtnState = (isActive) => {
      const b1 = document.getElementById('btnToggleFullTree');
      const b2 = document.getElementById('btnExpandAll');
      if (b1) b1.classList.toggle('active', isActive);
      if (b2) b2.classList.toggle('active', isActive);
    };

    const handleToggleFullTree = () => {
      const active = this.treeRenderer.toggleFullTreeExpansion();
      updateFullTreeBtnState(active);
      updateSiblingsBtnState(this.treeRenderer.showAncestorSiblings);
      this.showToast(active 
        ? 'Árbol completo desplegado (antepasados, hermanos, cónyuges y descendencia)' 
        : 'Vista contraída a 4 generaciones');
    };

    const btnToggleFullTree = document.getElementById('btnToggleFullTree');
    if (btnToggleFullTree) {
      btnToggleFullTree.addEventListener('click', handleToggleFullTree);
    }

    const btnExpandAll = document.getElementById('btnExpandAll');
    if (btnExpandAll) {
      btnExpandAll.addEventListener('click', handleToggleFullTree);
    }

    const btnCollapseAll = document.getElementById('btnCollapseAll');
    if (btnCollapseAll) {
      btnCollapseAll.addEventListener('click', () => {
        this.treeRenderer.collapseAncestors();
        updateFullTreeBtnState(false);
        this.showToast('Vista contraída a 4 generaciones');
      });
    }

    // Alternar visibilidad de hermanos de antepasados
    const updateSiblingsBtnState = (isActive) => {
      const b1 = document.getElementById('btnToggleSiblings');
      const b2 = document.getElementById('btnZoomToggleSiblings');
      if (b1) b1.classList.toggle('active', isActive);
      if (b2) b2.classList.toggle('active', isActive);
    };

    const handleToggleSiblings = () => {
      const active = this.treeRenderer.toggleAllAncestorSiblings();
      updateSiblingsBtnState(active);
      this.showToast(active ? 'Hermanos de antepasados visibles' : 'Hermanos de antepasados ocultos');
    };

    const btnToggleSiblings = document.getElementById('btnToggleSiblings');
    if (btnToggleSiblings) {
      btnToggleSiblings.addEventListener('click', handleToggleSiblings);
    }

    const btnZoomToggleSiblings = document.getElementById('btnZoomToggleSiblings');
    if (btnZoomToggleSiblings) {
      btnZoomToggleSiblings.addEventListener('click', handleToggleSiblings);
    }

    // Buscador general
    const searchInput = document.getElementById('searchPersonInput');
    const searchResults = document.getElementById('searchResultsDropdown');

    searchInput.addEventListener('input', (e) => {
      this.handleSearch(e.target.value.trim(), searchResults);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        searchResults.classList.remove('active');
      }
    });

    // Botones de acción principales
    document.getElementById('btnAddPerson').addEventListener('click', () => {
      this.openAddModal();
    });

    const btnExportImage = document.getElementById('btnExportImage');
    if (btnExportImage) {
      btnExportImage.addEventListener('click', async () => {
        try {
          const rootPerson = (this.treeData && this.treeData.personas)
            ? this.treeData.personas.find(p => String(p.id) === String(this.treeRenderer.rootPersonId))
            : (this.treeRenderer.peopleMap ? this.treeRenderer.peopleMap.get(String(this.treeRenderer.rootPersonId)) : null);
          const rootName = rootPerson ? `${rootPerson.nombre} ${rootPerson.apellidos || ''}`.trim() : 'Familia';
          this.showToast('Generando imagen de alta resolución...');
          const filename = await this.treeRenderer.exportToPng(rootName);
          this.showToast(`Imagen descargada con éxito: ${filename}`);
        } catch (err) {
          console.error(err);
          this.showToast(err.message || 'Error al exportar la imagen');
        }
      });
    }

    const btnPrintPdf = document.getElementById('btnPrintPdf');
    if (btnPrintPdf) {
      btnPrintPdf.addEventListener('click', () => {
        this.treeRenderer.printTree();
      });
    }

    document.getElementById('btnExportJson').addEventListener('click', () => {
      this.exportToJsonFile();
    });

    const btnExportGedcom = document.getElementById('btnExportGedcom');
    if (btnExportGedcom) {
      btnExportGedcom.addEventListener('click', () => {
        this.exportToTraditionalGedcomFile();
      });
    }

    const btnExportGedcomX = document.getElementById('btnExportGedcomX');
    if (btnExportGedcomX) {
      btnExportGedcomX.addEventListener('click', () => {
        this.exportToGedcomXFile();
      });
    }

    document.getElementById('btnImportJson').addEventListener('click', () => {
      document.getElementById('fileInputJson').click();
    });

    document.getElementById('fileInputJson').addEventListener('change', (e) => {
      this.handleFileImport(e);
    });

    document.getElementById('btnRawJson').addEventListener('click', () => {
      this.openRawJsonModal();
    });

    document.getElementById('btnResetDefault').addEventListener('click', () => {
      if (confirm('¿Restablecer el árbol a los datos de ejemplo originales? Se perderán las modificaciones locales no exportadas.')) {
        this.treeData = JSON.parse(JSON.stringify(DEFAULT_TREE_DATA));
        this.saveToLocalStorage();
        this.treeRenderer.setData(this.treeData);
        this.renderDirectoryList();
        this.updateStats();
        this.showToast('Árbol restablecido a datos de ejemplo');
      }
    });

    // Formulario de edición/creación
    const personForm = document.getElementById('personForm');
    personForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePersonFromForm();
    });

    // Checkbox de estado vital (¿Vive?)
    const chkVive = document.getElementById('formVive');
    chkVive.addEventListener('change', (e) => {
      const deathGroup = document.getElementById('deathFieldsGroup');
      deathGroup.style.display = e.target.checked ? 'none' : 'grid';
    });

    // Input de foto por archivo (optimización y conversión a Base64 compacto)
    const photoFileInput = document.getElementById('formPhotoFile');
    photoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 400; // Resolución ideal para retratos genealógicos ligeros
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.82);
            document.getElementById('formFoto').value = optimizedBase64;
            this.updatePhotoPreview(optimizedBase64);
          };
          img.src = loadEvent.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    document.getElementById('formFoto').addEventListener('input', (e) => {
      this.updatePhotoPreview(e.target.value);
    });

    // Modales: Botones de cerrar
    document.querySelectorAll('.modal-close-btn, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeAllModals();
      });
    });

    // Drawer de detalles: Cerrar
    document.getElementById('closeDetailDrawer').addEventListener('click', () => {
      this.closeDetailDrawer();
    });

    // Acciones del drawer
    document.getElementById('btnDrawerEdit').addEventListener('click', () => {
      if (this.selectedPersonId) this.openEditModal(this.selectedPersonId);
    });

    document.getElementById('btnDrawerFocus').addEventListener('click', () => {
      if (this.selectedPersonId) {
        this.treeRenderer.setRootPerson(this.selectedPersonId);
        if (this.activeView === 'list') this.toggleDirectoryView();
        this.updateDrawerSimultaneousButton();
      }
    });

    const btnDrawerSimultaneous = document.getElementById('btnDrawerSimultaneous');
    if (btnDrawerSimultaneous) {
      btnDrawerSimultaneous.addEventListener('click', () => {
        if (this.selectedPersonId) {
          this.treeRenderer.toggleSimultaneousTree(this.selectedPersonId);
          this.updateDrawerSimultaneousButton();
          if (this.activeView === 'list') this.toggleDirectoryView();
        }
      });
    }

    document.getElementById('btnDrawerDelete').addEventListener('click', () => {
      if (this.selectedPersonId) this.deletePerson(this.selectedPersonId);
    });

    // Modal Raw JSON
    document.getElementById('btnCopyJson').addEventListener('click', () => {
      const textarea = document.getElementById('rawJsonTextarea');
      textarea.select();
      navigator.clipboard.writeText(textarea.value);
      this.showToast('JSON copiado al portapapeles');
    });

    document.getElementById('btnApplyJson').addEventListener('click', () => {
      this.applyRawJson();
    });
  }

  // ==========================================
  // VISTAS Y MODOS
  // ==========================================
  setTreeViewMode(mode, targetBtn) {
    document.querySelectorAll('.btn-view-mode').forEach(b => b.classList.remove('active'));
    targetBtn.classList.add('active');
    this.treeRenderer.setMode(mode);
    if (this.activeView === 'list') {
      this.toggleDirectoryView();
    }
  }

  toggleDirectoryView() {
    const treeWrapper = document.getElementById('treeContainerWrapper');
    const directoryWrapper = document.getElementById('directoryContainerWrapper');
    const btn = document.getElementById('btnViewDirectory');

    if (this.activeView === 'tree') {
      this.activeView = 'list';
      treeWrapper.style.display = 'none';
      directoryWrapper.style.display = 'block';
      btn.classList.add('active');
      this.renderDirectoryList();
    } else {
      this.activeView = 'tree';
      treeWrapper.style.display = 'block';
      directoryWrapper.style.display = 'none';
      btn.classList.remove('active');
      this.treeRenderer.render();
    }
  }

  // ==========================================
  // BUSCADOR
  // ==========================================
  handleSearch(query, resultsContainer) {
    if (!query) {
      resultsContainer.classList.remove('active');
      resultsContainer.innerHTML = '';
      return;
    }

    const q = query.toLowerCase();
    const matches = this.treeData.personas.filter(p => {
      const full = `${p.nombre || ''} ${p.apellidos || ''}`.toLowerCase();
      const place = (p.lugarNacimiento || '').toLowerCase();
      const year = (p.fechaNacimiento || '').substring(0, 4);
      return full.includes(q) || place.includes(q) || year.includes(q);
    });

    if (matches.length === 0) {
      resultsContainer.innerHTML = '<div class="search-item search-empty">No se encontraron familiares</div>';
      resultsContainer.classList.add('active');
      return;
    }

    resultsContainer.innerHTML = matches.slice(0, 8).map(p => {
      const dates = this.treeRenderer.formatLifeSpan(p);
      return `
        <div class="search-item" data-id="${p.id}">
          <span class="search-avatar ${p.genero === 'F' ? 'gender-f' : 'gender-m'}">${this.treeRenderer.getInitials(p)}</span>
          <div class="search-info">
            <div class="search-name">${p.nombre} ${p.apellidos || ''}</div>
            <div class="search-meta">${dates} ${p.lugarNacimiento ? '• ' + p.lugarNacimiento : ''}</div>
          </div>
        </div>
      `;
    }).join('');

    resultsContainer.classList.add('active');

    resultsContainer.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        resultsContainer.classList.remove('active');
        document.getElementById('searchPersonInput').value = '';
        this.treeRenderer.setRootPerson(id);
        this.openDetailDrawer(id);
      });
    });
  }

  // ==========================================
  // DETALLES Y DRAWER LATERAL
  // ==========================================
  openDetailDrawer(personId) {
    this.selectedPersonId = String(personId);
    const person = this.treeData.personas.find(p => String(p.id) === this.selectedPersonId);
    if (!person) return;

    const drawer = document.getElementById('detailDrawer');
    drawer.classList.add('active');

    // Avatar y Nombres
    const initials = this.treeRenderer.getInitials(person);
    const avatarContainer = document.getElementById('drawerAvatar');
    if (person.foto) {
      avatarContainer.innerHTML = `<img src="${person.foto}" alt="${person.nombre}" class="drawer-photo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="drawer-initials" style="display:none;">${initials}</div>`;
    } else {
      avatarContainer.innerHTML = `<div class="drawer-initials">${initials}</div>`;
    }

    document.getElementById('drawerName').textContent = `${person.nombre} ${person.apellidos || ''}`;
    document.getElementById('drawerGenderBadge').textContent = person.genero === 'F' ? 'Mujer (♀)' : (person.genero === 'M' ? 'Hombre (♂)' : 'Otro');
    document.getElementById('drawerGenderBadge').className = `badge-gender ${person.genero === 'F' ? 'badge-f' : 'badge-m'}`;

    // Fechas y edades
    document.getElementById('drawerBirth').textContent = this.formatDateWithPlace(person.fechaNacimiento, person.lugarNacimiento);
    
    const deathRow = document.getElementById('drawerDeathRow');
    if (person.fechaFallecimiento || person.lugarFallecimiento) {
      deathRow.style.display = 'flex';
      document.getElementById('drawerDeath').textContent = this.formatDateWithPlace(person.fechaFallecimiento, person.lugarFallecimiento);
    } else {
      deathRow.style.display = 'none';
    }

    document.getElementById('drawerAge').textContent = this.calculateAgeString(person);
    document.getElementById('drawerProfession').textContent = person.profesion || 'No especificada';
    document.getElementById('drawerNotes').textContent = person.notas || 'Sin notas registradas.';

    // Parientes
    this.populateDrawerRelations(person);
  }

  closeDetailDrawer() {
    document.getElementById('detailDrawer').classList.remove('active');
    this.selectedPersonId = null;
  }

  populateDrawerRelations(person) {
    const father = person.padreId ? this.treeData.personas.find(p => String(p.id) === String(person.padreId)) : null;
    const mother = person.madreId ? this.treeData.personas.find(p => String(p.id) === String(person.madreId)) : null;
    const spouse = person.parejaId ? this.treeData.personas.find(p => String(p.id) === String(person.parejaId)) : null;

    const children = this.treeData.personas.filter(p => 
      String(p.padreId) === String(person.id) || String(p.madreId) === String(person.id)
    );

    const siblings = this.treeData.personas.filter(p => 
      String(p.id) !== String(person.id) && 
      ((person.padreId && String(p.padreId) === String(person.padreId)) ||
       (person.madreId && String(p.madreId) === String(person.madreId)))
    );

    const fillRelation = (elemId, relPerson, type, emptyText) => {
      const el = document.getElementById(elemId);
      if (relPerson) {
        el.innerHTML = `
          <div class="relation-chip" data-id="${relPerson.id}">
            <span class="chip-avatar">${this.treeRenderer.getInitials(relPerson)}</span>
            <span class="chip-name">${relPerson.nombre} ${relPerson.apellidos || ''}</span>
          </div>
        `;
      } else {
        el.innerHTML = `
          <button class="btn-relation-add" data-action="add-rel" data-type="${type}" data-person="${person.id}">
            + ${emptyText}
          </button>
        `;
      }
    };

    fillRelation('drawerFather', father, 'padre', 'Añadir Padre');
    fillRelation('drawerMother', mother, 'madre', 'Añadir Madre');
    fillRelation('drawerSpouse', spouse, 'spouse', 'Añadir Cónyuge');

    // Hijos
    const childrenContainer = document.getElementById('drawerChildren');
    if (children.length > 0) {
      childrenContainer.innerHTML = children.map(c => `
        <div class="relation-chip" data-id="${c.id}">
          <span class="chip-avatar">${this.treeRenderer.getInitials(c)}</span>
          <span class="chip-name">${c.nombre} ${c.apellidos || ''}</span>
        </div>
      `).join('') + `
        <button class="btn-relation-add" data-action="add-rel" data-type="child" data-person="${person.id}">+ Añadir Hijo/a</button>
      `;
    } else {
      childrenContainer.innerHTML = `
        <button class="btn-relation-add" data-action="add-rel" data-type="child" data-person="${person.id}">+ Añadir Hijo/a</button>
      `;
    }

    // Hermanos
    const sibContainer = document.getElementById('drawerSiblings');
    if (siblings.length > 0) {
      sibContainer.innerHTML = siblings.map(s => `
        <div class="relation-chip" data-id="${s.id}">
          <span class="chip-avatar">${this.treeRenderer.getInitials(s)}</span>
          <span class="chip-name">${s.nombre} ${s.apellidos || ''}</span>
        </div>
      `).join('');
    } else {
      sibContainer.innerHTML = `<span class="empty-relation">Ninguno registrado</span>`;
    }

    // Eventos de los chips de relaciones
    document.querySelectorAll('#detailDrawer .relation-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.id;
        this.openDetailDrawer(id);
      });
    });

    document.querySelectorAll('#detailDrawer .btn-relation-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const pId = btn.dataset.person;
        this.handleQuickAdd({ type, personId: pId, childId: type === 'padre' || type === 'madre' ? pId : null });
      });
    });

    this.updateDrawerSimultaneousButton();
  }

  updateDrawerSimultaneousButton() {
    const btn = document.getElementById('btnDrawerSimultaneous');
    if (!btn || !this.selectedPersonId) return;

    if (String(this.selectedPersonId) === String(this.treeRenderer.rootPersonId)) {
      btn.style.display = 'none'; // No se puede ver simultáneo a la persona que ya es raíz
      return;
    }

    btn.style.display = 'inline-flex';
    const isSimultaneous = this.treeRenderer.simultaneousRootIds.has(String(this.selectedPersonId));
    if (isSimultaneous) {
      btn.innerHTML = '👁️‍🗨️ Ocultar a la vez';
      btn.classList.add('active');
      btn.title = 'Ocultar el árbol simultáneo de este familiar';
    } else {
      btn.innerHTML = '👁️ Ver a la vez';
      btn.classList.remove('active');
      btn.title = 'Visualizar el árbol de este familiar a la vez en el lienzo';
    }
  }

  // ==========================================
  // MODALES DE EDICIÓN Y CREACIÓN (CRUD)
  // ==========================================
  populateParentSelects(excludeId = null) {
    const fatherSelect = document.getElementById('formPadreId');
    const motherSelect = document.getElementById('formMadreId');
    const spouseSelect = document.getElementById('formParejaId');

    const makeOptions = (filterGender = null) => {
      let html = '<option value="">-- Ninguno / Desconocido --</option>';
      this.treeData.personas.forEach(p => {
        if (excludeId && String(p.id) === String(excludeId)) return;
        if (filterGender && p.genero !== filterGender) return;
        html += `<option value="${p.id}">${p.nombre} ${p.apellidos || ''} (${this.treeRenderer.formatLifeSpan(p)})</option>`;
      });
      return html;
    };

    fatherSelect.innerHTML = makeOptions('M');
    motherSelect.innerHTML = makeOptions('F');
    spouseSelect.innerHTML = makeOptions();
  }

  openAddModal() {
    this.editingPersonId = null;
    this.quickAddContext = null;
    document.getElementById('personModalTitle').textContent = 'Añadir Nuevo Familiar';
    document.getElementById('personForm').reset();
    document.getElementById('formPersonId').value = '';
    document.getElementById('formVive').checked = true;
    document.getElementById('deathFieldsGroup').style.display = 'none';
    this.updatePhotoPreview('');
    this.populateParentSelects();
    this.showModal('personModal');
  }

  openEditModal(personId) {
    this.editingPersonId = String(personId);
    this.quickAddContext = null;
    const person = this.treeData.personas.find(p => String(p.id) === this.editingPersonId);
    if (!person) return;

    document.getElementById('personModalTitle').textContent = `Editar: ${person.nombre} ${person.apellidos || ''}`;
    this.populateParentSelects(person.id);

    // Llenar campos
    document.getElementById('formPersonId').value = person.id;
    document.getElementById('formNombre').value = person.nombre || '';
    document.getElementById('formApellidos').value = person.apellidos || '';
    document.getElementById('formGenero').value = person.genero || 'M';
    document.getElementById('formFechaNacimiento').value = person.fechaNacimiento || '';
    document.getElementById('formLugarNacimiento').value = person.lugarNacimiento || '';

    const isAlive = !person.fechaFallecimiento && !person.lugarFallecimiento;
    document.getElementById('formVive').checked = isAlive;
    document.getElementById('deathFieldsGroup').style.display = isAlive ? 'none' : 'grid';

    document.getElementById('formFechaFallecimiento').value = person.fechaFallecimiento || '';
    document.getElementById('formLugarFallecimiento').value = person.lugarFallecimiento || '';
    document.getElementById('formProfesion').value = person.profesion || '';
    document.getElementById('formFoto').value = person.foto || '';
    document.getElementById('formNotas').value = person.notas || '';

    document.getElementById('formPadreId').value = person.padreId || '';
    document.getElementById('formMadreId').value = person.madreId || '';
    document.getElementById('formParejaId').value = person.parejaId || '';

    this.updatePhotoPreview(person.foto);
    this.showModal('personModal');
  }

  handleQuickAdd(detail) {
    this.openAddModal();
    this.quickAddContext = detail;

    if (detail.type === 'padre') {
      document.getElementById('formGenero').value = 'M';
      document.getElementById('personModalTitle').textContent = 'Añadir Padre';
    } else if (detail.type === 'madre') {
      document.getElementById('formGenero').value = 'F';
      document.getElementById('personModalTitle').textContent = 'Añadir Madre';
    } else if (detail.type === 'child') {
      document.getElementById('personModalTitle').textContent = 'Añadir Hijo/a';
      const parent = this.treeData.personas.find(p => String(p.id) === String(detail.personId));
      if (parent) {
        if (parent.genero === 'F') {
          document.getElementById('formMadreId').value = parent.id;
          if (parent.parejaId) document.getElementById('formPadreId').value = parent.parejaId;
        } else {
          document.getElementById('formPadreId').value = parent.id;
          if (parent.parejaId) document.getElementById('formMadreId').value = parent.parejaId;
        }
      }
    } else if (detail.type === 'spouse') {
      document.getElementById('personModalTitle').textContent = 'Añadir Cónyuge / Pareja';
      const current = this.treeData.personas.find(p => String(p.id) === String(detail.personId));
      if (current) {
        document.getElementById('formGenero').value = current.genero === 'M' ? 'F' : 'M';
        document.getElementById('formParejaId').value = current.id;
      }
    }
  }

  savePersonFromForm() {
    const isAlive = document.getElementById('formVive').checked;
    const personId = document.getElementById('formPersonId').value;
    
    const newPerson = {
      id: personId || this.generateNextId(),
      nombre: document.getElementById('formNombre').value.trim(),
      apellidos: document.getElementById('formApellidos').value.trim(),
      genero: document.getElementById('formGenero').value,
      fechaNacimiento: document.getElementById('formFechaNacimiento').value || null,
      lugarNacimiento: document.getElementById('formLugarNacimiento').value.trim() || null,
      fechaFallecimiento: isAlive ? null : (document.getElementById('formFechaFallecimiento').value || null),
      lugarFallecimiento: isAlive ? null : (document.getElementById('formLugarFallecimiento').value.trim() || null),
      padreId: document.getElementById('formPadreId').value || null,
      madreId: document.getElementById('formMadreId').value || null,
      parejaId: document.getElementById('formParejaId').value || null,
      profesion: document.getElementById('formProfesion').value.trim() || null,
      foto: document.getElementById('formFoto').value.trim() || '',
      notas: document.getElementById('formNotas').value.trim() || ''
    };

    if (!newPerson.nombre) {
      alert('Por favor introduce al menos el nombre.');
      return;
    }

    if (this.editingPersonId) {
      // Actualizar existente
      const idx = this.treeData.personas.findIndex(p => String(p.id) === this.editingPersonId);
      if (idx !== -1) {
        this.treeData.personas[idx] = newPerson;
      }
    } else {
      // Añadir nuevo
      this.treeData.personas.push(newPerson);

      // Si venía de QuickAdd, enlazar hacia atrás
      if (this.quickAddContext) {
        if (this.quickAddContext.type === 'padre' && this.quickAddContext.childId) {
          const child = this.treeData.personas.find(p => String(p.id) === String(this.quickAddContext.childId));
          if (child) child.padreId = newPerson.id;
        } else if (this.quickAddContext.type === 'madre' && this.quickAddContext.childId) {
          const child = this.treeData.personas.find(p => String(p.id) === String(this.quickAddContext.childId));
          if (child) child.madreId = newPerson.id;
        } else if (this.quickAddContext.type === 'spouse' && this.quickAddContext.personId) {
          const sp = this.treeData.personas.find(p => String(p.id) === String(this.quickAddContext.personId));
          if (sp) sp.parejaId = newPerson.id;
        }
      }
    }

    // Si se especificó pareja, sincronizar recíprocamente
    if (newPerson.parejaId) {
      const spouse = this.treeData.personas.find(p => String(p.id) === String(newPerson.parejaId));
      if (spouse && !spouse.parejaId) {
        spouse.parejaId = newPerson.id;
      }
    }

    const targetRoot = this.treeRenderer.rootPersonId || newPerson.id;
    this.saveToLocalStorage();
    this.closeAllModals();
    this.treeRenderer.setData(this.treeData, targetRoot);
    this.renderDirectoryList();
    this.updateStats();

    if (this.selectedPersonId === newPerson.id) {
      this.openDetailDrawer(newPerson.id);
    }
    this.showToast('Familiar guardado con éxito');
  }

  deletePerson(personId) {
    const person = this.treeData.personas.find(p => String(p.id) === String(personId));
    if (!person) return;

    if (!confirm(`¿Estás seguro de eliminar a ${person.nombre} ${person.apellidos || ''}? Se limpiarán los vínculos de parentesco asociados.`)) {
      return;
    }

    // 1. Eliminar de la lista
    this.treeData.personas = this.treeData.personas.filter(p => String(p.id) !== String(personId));

    // 2. Limpiar referencias en otros familiares
    this.treeData.personas.forEach(p => {
      if (String(p.padreId) === String(personId)) p.padreId = null;
      if (String(p.madreId) === String(personId)) p.madreId = null;
      if (String(p.parejaId) === String(personId)) p.parejaId = null;
    });

    // 3. Si era la persona raíz, cambiar a la primera disponible
    if (String(this.treeRenderer.rootPersonId) === String(personId)) {
      this.treeRenderer.rootPersonId = this.treeData.personas.length > 0 ? this.treeData.personas[0].id : null;
    }

    this.saveToLocalStorage();
    this.closeDetailDrawer();
    this.treeRenderer.setData(this.treeData, this.treeRenderer.rootPersonId);
    this.renderDirectoryList();
    this.updateStats();
    this.showToast('Persona eliminada');
  }

  generateNextId() {
    let maxId = 0;
    this.treeData.personas.forEach(p => {
      const num = parseInt(p.id, 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    });
    return String(maxId + 1);
  }

  updatePhotoPreview(url) {
    const preview = document.getElementById('formPhotoPreview');
    if (url) {
      preview.src = url;
      preview.style.display = 'block';
    } else {
      preview.src = '';
      preview.style.display = 'none';
    }
  }

  // ==========================================
  // DIRECTORIO FAMILIAR (LISTA / TABLA)
  // ==========================================
  renderDirectoryList() {
    const container = document.getElementById('directoryTableBody');
    if (!container) return;

    const people = [...this.treeData.personas].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    if (people.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
            <div>No hay familiares registrados todavía.</div>
            <button class="btn-primary" style="margin-top: 14px;" onclick="window.app.openAddModal()">+ Añadir Primera Persona</button>
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = people.map(p => {
      const dates = this.treeRenderer.formatLifeSpan(p);
      const father = p.padreId ? this.treeData.personas.find(x => String(x.id) === String(p.padreId)) : null;
      const mother = p.madreId ? this.treeData.personas.find(x => String(x.id) === String(p.madreId)) : null;
      const spouse = p.parejaId ? this.treeData.personas.find(x => String(x.id) === String(p.parejaId)) : null;

      const parentsText = [
        father ? father.nombre : null,
        mother ? mother.nombre : null
      ].filter(Boolean).join(' y ') || '—';

      return `
        <tr>
          <td>
            <div class="dir-person-cell">
              <span class="dir-avatar ${p.genero === 'F' ? 'gender-f' : 'gender-m'}">${this.treeRenderer.getInitials(p)}</span>
              <div>
                <strong>${p.nombre} ${p.apellidos || ''}</strong>
                <div class="dir-meta-dates">${dates}</div>
              </div>
            </div>
          </td>
          <td>${p.genero === 'F' ? 'Mujer' : (p.genero === 'M' ? 'Hombre' : 'Otro')}</td>
          <td>${p.lugarNacimiento || '—'}</td>
          <td>${parentsText}</td>
          <td>${spouse ? `${spouse.nombre} ${spouse.apellidos || ''}` : '—'}</td>
          <td>${p.profesion || '—'}</td>
          <td>
            <div class="table-actions">
              <button class="btn-table-action" title="Centrar árbol aquí" onclick="window.app.focusAndSwitchTree('${p.id}')">🎯</button>
              <button class="btn-table-action" title="Ver ficha" onclick="window.app.openDetailDrawer('${p.id}')">👁️</button>
              <button class="btn-table-action" title="Editar" onclick="window.app.openEditModal('${p.id}')">✏️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  focusAndSwitchTree(id) {
    this.treeRenderer.setRootPerson(id);
    this.toggleDirectoryView();
  }

  // ==========================================
  // IMPORTACIÓN, EXPORTACIÓN Y RAW JSON
  // ==========================================
  exportToJsonFile() {
    const dataStr = JSON.stringify(this.treeData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arbol_genealogico_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.showToast('Archivo JSON descargado');
  }

  // ==========================================
  // EXPORTACIÓN A GEDCOM ESTÁNDAR (.ged 5.5.1)
  // ==========================================
  exportToTraditionalGedcomFile() {
    const gedcomText = this.convertToTraditionalGedcom(this.treeData);
    const blob = new Blob([gedcomText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = (this.treeData.config && this.treeData.config.titulo)
      ? this.treeData.config.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 25)
      : 'arbol_genealogico';
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `${safeTitle}_${today}.ged`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.showToast('Árbol exportado en formato estándar internacional GEDCOM (.ged 5.5.1)');
  }

  convertToTraditionalGedcom(treeData) {
    const personas = treeData.personas || [];
    const lines = [];

    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const formatGedDate = (dStr) => {
      if (!dStr) return '';
      dStr = String(dStr).trim();
      const mIso = dStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (mIso) {
        const y = parseInt(mIso[1], 10);
        const m = parseInt(mIso[2], 10) - 1;
        const d = parseInt(mIso[3], 10);
        return `${d} ${MONTHS[m] || 'JAN'} ${y}`;
      }
      const mYm = dStr.match(/^(\d{4})-(\d{2})$/);
      if (mYm) {
        const y = parseInt(mYm[1], 10);
        const m = parseInt(mYm[2], 10) - 1;
        return `${MONTHS[m] || 'JAN'} ${y}`;
      }
      return dStr;
    };

    // 1. Cabecera GEDCOM 5.5.1
    const now = new Date();
    const day = now.getDate();
    const mon = MONTHS[now.getMonth()];
    const yr = now.getFullYear();
    lines.push('0 HEAD');
    lines.push('1 SOUR ArbolGenealogico');
    lines.push('2 VERS 1.0');
    lines.push('2 NAME Mi Arbol Genealogico');
    lines.push('1 DEST ANY');
    lines.push(`1 DATE ${day} ${mon} ${yr}`);
    lines.push('1 SUBM @SUBM1@');
    lines.push('1 GEDC');
    lines.push('2 VERS 5.5.1');
    lines.push('2 FORM LINEAGE-LINKED');
    lines.push('1 CHAR UTF-8');
    lines.push('0 @SUBM1@ SUBM');
    lines.push('1 NAME Usuario');

    // Mapeo unívoco de ID a identificadores GEDCOM @I1@, @I2@...
    const personGedIdMap = new Map();
    personas.forEach((p, idx) => {
      personGedIdMap.set(String(p.id), `@I${idx + 1}@`);
    });

    // 2. Construcción de familias (@F1@, @F2@...)
    const families = [];
    const famKeyMap = new Map();
    let famCounter = 1;

    const getOrCreateFamily = (fatherId, motherId) => {
      const fId = fatherId ? String(fatherId) : '';
      const mId = motherId ? String(motherId) : '';
      if (!fId && !mId) return null;

      const key = `${fId}_${mId}`;
      if (famKeyMap.has(key)) return famKeyMap.get(key);

      const famId = `@F${famCounter++}@`;
      const fam = {
        id: famId,
        husb: fId ? personGedIdMap.get(fId) : null,
        wife: mId ? personGedIdMap.get(mId) : null,
        children: [],
        isMarriage: !!(fId && mId)
      };
      families.push(fam);
      famKeyMap.set(key, fam);
      if (fId && mId) famKeyMap.set(`${mId}_${fId}`, fam);
      return fam;
    };

    // Familias con descendientes
    personas.forEach(p => {
      if (p.padreId || p.madreId) {
        const fam = getOrCreateFamily(p.padreId, p.madreId);
        if (fam) fam.children.push(personGedIdMap.get(String(p.id)));
      }
    });

    // Familias conyugales sin hijos
    personas.forEach(p => {
      if (p.parejaId) {
        const p1 = p;
        const p2 = personas.find(x => String(x.id) === String(p.parejaId));
        if (p2) {
          const fId = (p1.genero === 'F' && p2.genero === 'M') ? p2.id : p1.id;
          const mId = (p1.genero === 'F' && p2.genero === 'M') ? p1.id : p2.id;
          getOrCreateFamily(fId, mId);
        }
      }
    });

    const personFamc = new Map();
    const personFams = new Map();

    families.forEach(f => {
      f.children.forEach(cId => {
        if (!personFamc.has(cId)) personFamc.set(cId, f.id);
      });
      if (f.husb) {
        if (!personFams.has(f.husb)) personFams.set(f.husb, new Set());
        personFams.get(f.husb).add(f.id);
      }
      if (f.wife) {
        if (!personFams.has(f.wife)) personFams.set(f.wife, new Set());
        personFams.get(f.wife).add(f.id);
      }
    });

    // 3. Registros de Individuos (INDI)
    personas.forEach(p => {
      const gedId = personGedIdMap.get(String(p.id));
      lines.push(`0 ${gedId} INDI`);

      const nombre = (p.nombre || '').trim();
      const apellidos = (p.apellidos || '').trim();
      lines.push(`1 NAME ${nombre} /${apellidos}/`.trim());
      if (nombre) lines.push(`2 GIVN ${nombre}`);
      if (apellidos) lines.push(`2 SURN ${apellidos}`);

      let sex = 'U';
      if (p.genero === 'M') sex = 'M';
      else if (p.genero === 'F') sex = 'F';
      lines.push(`1 SEX ${sex}`);

      if (p.fechaNacimiento || p.lugarNacimiento) {
        lines.push('1 BIRT');
        if (p.fechaNacimiento) lines.push(`2 DATE ${formatGedDate(p.fechaNacimiento)}`);
        if (p.lugarNacimiento) lines.push(`2 PLAC ${p.lugarNacimiento.trim()}`);
      }

      if (p.vive === false || p.fechaFallecimiento || p.lugarFallecimiento) {
        lines.push('1 DEAT');
        if (p.fechaFallecimiento) lines.push(`2 DATE ${formatGedDate(p.fechaFallecimiento)}`);
        if (p.lugarFallecimiento) lines.push(`2 PLAC ${p.lugarFallecimiento.trim()}`);
        if (!p.fechaFallecimiento && !p.lugarFallecimiento) lines.push('2 DATE Y');
      }

      if (p.profesion) {
        lines.push(`1 OCCU ${p.profesion.trim()}`);
      }

      if (p.notas) {
        const noteLines = p.notas.split('\n');
        noteLines.forEach((nl, nIdx) => {
          if (nIdx === 0) lines.push(`1 NOTE ${nl}`);
          else lines.push(`2 CONT ${nl}`);
        });
      }

      if (personFamc.has(gedId)) {
        lines.push(`1 FAMC ${personFamc.get(gedId)}`);
      }

      if (personFams.has(gedId)) {
        personFams.get(gedId).forEach(fId => {
          lines.push(`1 FAMS ${fId}`);
        });
      }
    });

    // 4. Registros de Familias (FAM)
    families.forEach(f => {
      lines.push(`0 ${f.id} FAM`);
      if (f.husb) lines.push(`1 HUSB ${f.husb}`);
      if (f.wife) lines.push(`1 WIFE ${f.wife}`);
      f.children.forEach(cId => {
        lines.push(`1 CHIL ${cId}`);
      });
      if (f.isMarriage) {
        lines.push('1 MARR');
      }
    });

    // 5. Fin de archivo GEDCOM
    lines.push('0 TRLR');
    return lines.join('\n');
  }

  exportToGedcomXFile() {
    const gedcomXData = this.convertToGedcomX(this.treeData);
    const dataStr = JSON.stringify(gedcomXData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/x-gedcomx-v1+json,application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arbol_genealogico_gedcomx_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.showToast('Árbol exportado en formato estándar GEDCOM X');
  }

  convertToGedcomX(treeData) {
    const persons = [];
    const relationships = [];
    const couplePairs = new Set();
    const parentChildPairs = new Set();

    (treeData.personas || []).forEach(p => {
      let genderType = "http://gedcomx.org/Unknown";
      if (p.genero === 'M') genderType = "http://gedcomx.org/Male";
      else if (p.genero === 'F') genderType = "http://gedcomx.org/Female";

      const givenName = p.nombre ? String(p.nombre).trim() : '';
      const surname = p.apellidos ? String(p.apellidos).trim() : '';
      const fullName = `${givenName} ${surname}`.trim();

      const nameParts = [];
      if (givenName) nameParts.push({ type: "http://gedcomx.org/Given", value: givenName });
      if (surname) nameParts.push({ type: "http://gedcomx.org/Surname", value: surname });

      const names = [];
      if (fullName) {
        names.push({
          type: "http://gedcomx.org/BirthName",
          preferred: true,
          nameForms: [{ fullText: fullName, parts: nameParts }]
        });
      }

      const facts = [];
      if (p.fechaNacimiento || p.lugarNacimiento) {
        const birthFact = { type: "http://gedcomx.org/Birth" };
        if (p.fechaNacimiento) birthFact.date = { original: String(p.fechaNacimiento) };
        if (p.lugarNacimiento) birthFact.place = { original: String(p.lugarNacimiento) };
        facts.push(birthFact);
      }

      if (p.fechaFallecimiento || p.lugarFallecimiento || p.fallecido) {
        const deathFact = { type: "http://gedcomx.org/Death" };
        if (p.fechaFallecimiento) deathFact.date = { original: String(p.fechaFallecimiento) };
        if (p.lugarFallecimiento) deathFact.place = { original: String(p.lugarFallecimiento) };
        facts.push(deathFact);
      }

      if (p.profesion) {
        facts.push({
          type: "http://gedcomx.org/Occupation",
          value: String(p.profesion).trim()
        });
      }

      const notes = [];
      const bioText = p.biografia || p.notas;
      if (bioText) {
        notes.push({ text: String(bioText).trim() });
      }

      const gxPerson = {
        id: String(p.id),
        living: !p.fallecido && !p.fechaFallecimiento,
        gender: { type: genderType },
        names: names,
        facts: facts
      };

      if (notes.length > 0) gxPerson.notes = notes;
      if (p.foto) {
        gxPerson.media = [{ description: "Foto", url: p.foto }];
      }

      persons.push(gxPerson);

      if (p.padreId) {
        const pairKey = `${p.padreId}->${p.id}`;
        if (!parentChildPairs.has(pairKey)) {
          parentChildPairs.add(pairKey);
          relationships.push({
            id: `pc-${p.padreId}-${p.id}`,
            type: "http://gedcomx.org/ParentChild",
            person1: { resource: `#${p.padreId}` },
            person2: { resource: `#${p.id}` }
          });
        }
      }

      if (p.madreId) {
        const pairKey = `${p.madreId}->${p.id}`;
        if (!parentChildPairs.has(pairKey)) {
          parentChildPairs.add(pairKey);
          relationships.push({
            id: `pc-${p.madreId}-${p.id}`,
            type: "http://gedcomx.org/ParentChild",
            person1: { resource: `#${p.madreId}` },
            person2: { resource: `#${p.id}` }
          });
        }
      }

      if (p.parejaId) {
        const sortedCouple = [String(p.id), String(p.parejaId)].sort();
        const coupleKey = sortedCouple.join('<->');
        if (!couplePairs.has(coupleKey)) {
          couplePairs.add(coupleKey);
          relationships.push({
            id: `cp-${sortedCouple[0]}-${sortedCouple[1]}`,
            type: "http://gedcomx.org/Couple",
            person1: { resource: `#${sortedCouple[0]}` },
            person2: { resource: `#${sortedCouple[1]}` }
          });
        }
      }
    });

    return {
      attribution: {
        creator: { resource: "#antigravity-arbol-genealogico" },
        created: new Date().toISOString()
      },
      description: `#${(treeData.config && treeData.config.titulo) || 'Arbol Genealogico'}`,
      persons,
      relationships
    };
  }

  parseGedcomX(gx) {
    const peopleMap = new Map();

    (gx.persons || []).forEach(p => {
      let genero = 'X';
      if (p.gender && p.gender.type) {
        if (p.gender.type.endsWith('Female')) genero = 'F';
        else if (p.gender.type.endsWith('Male')) genero = 'M';
      }

      let nombre = '';
      let apellidos = '';
      if (p.names && p.names.length > 0) {
        const prefName = p.names.find(n => n.preferred) || p.names[0];
        if (prefName.nameForms && prefName.nameForms.length > 0) {
          const form = prefName.nameForms[0];
          if (form.parts && form.parts.length > 0) {
            const givenPart = form.parts.find(pt => pt.type && pt.type.endsWith('Given'));
            const surPart = form.parts.find(pt => pt.type && pt.type.endsWith('Surname'));
            if (givenPart) nombre = givenPart.value;
            if (surPart) apellidos = surPart.value;
          } else if (form.fullText) {
            const parts = form.fullText.split(/\s+/);
            nombre = parts[0] || '';
            apellidos = parts.slice(1).join(' ') || '';
          }
        }
      }

      let fechaNacimiento = '';
      let lugarNacimiento = '';
      let fechaFallecimiento = '';
      let lugarFallecimiento = '';
      let profesion = '';

      (p.facts || []).forEach(f => {
        if (f.type && f.type.endsWith('Birth')) {
          if (f.date && f.date.original) fechaNacimiento = f.date.original;
          if (f.place && f.place.original) lugarNacimiento = f.place.original;
        } else if (f.type && f.type.endsWith('Death')) {
          if (f.date && f.date.original) fechaFallecimiento = f.date.original;
          if (f.place && f.place.original) lugarFallecimiento = f.place.original;
        } else if (f.type && f.type.endsWith('Occupation')) {
          if (f.value) profesion = f.value;
        }
      });

      let biografia = '';
      if (p.notes && p.notes.length > 0) {
        biografia = p.notes.map(n => n.text).join('\n');
      }

      let foto = null;
      if (p.media && p.media.length > 0 && p.media[0].url) {
        foto = p.media[0].url;
      }

      const fallecido = p.living === false || !!fechaFallecimiento;

      peopleMap.set(String(p.id), {
        id: String(p.id),
        nombre,
        apellidos,
        genero,
        fechaNacimiento,
        fechaFallecimiento,
        lugarNacimiento,
        lugarFallecimiento,
        profesion,
        biografia,
        fallecido,
        padreId: null,
        madreId: null,
        parejaId: null,
        foto
      });
    });

    (gx.relationships || []).forEach(r => {
      const p1Id = r.person1 && r.person1.resource ? r.person1.resource.replace('#', '') : null;
      const p2Id = r.person2 && r.person2.resource ? r.person2.resource.replace('#', '') : null;
      if (!p1Id || !p2Id) return;

      if (r.type && r.type.endsWith('ParentChild')) {
        const parent = peopleMap.get(p1Id);
        const child = peopleMap.get(p2Id);
        if (child && parent) {
          if (parent.genero === 'F') {
            child.madreId = parent.id;
          } else {
            child.padreId = parent.id;
          }
        }
      } else if (r.type && r.type.endsWith('Couple')) {
        const sp1 = peopleMap.get(p1Id);
        const sp2 = peopleMap.get(p2Id);
        if (sp1) sp1.parejaId = p2Id;
        if (sp2) sp2.parejaId = p1Id;
      }
    });

    return {
      config: {
        titulo: (gx.description && gx.description.replace(/^#/, '')) || "Árbol Genealógico GEDCOM X",
        personaRaizId: peopleMap.size > 0 ? Array.from(peopleMap.keys())[0] : null
      },
      personas: Array.from(peopleMap.values())
    };
  }

  // ==========================================
  // PARSER DE GEDCOM ESTÁNDAR (.ged 5.5.1 / 7.0)
  // ==========================================
  parseTraditionalGedcom(content) {
    if (!content || !content.trim()) throw new Error('El archivo GEDCOM está vacío.');

    const monthMap = {
      'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
      'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12',
      'ENE': '01', 'ABR': '04', 'AGO': '08', 'DIC': '12'
    };

    const parseGedDate = (str) => {
      if (!str) return '';
      str = str.trim();
      const upper = str.toUpperCase().replace(/^(ABT|CAL|EST|BEF|AFT|CIRCA|CA\.?|BET|FROM)\s+/i, '');
      
      const dmy = upper.match(/^(\d{1,2})\s+([A-Z]{3,4})\s+(\d{4})$/);
      if (dmy) {
        const day = dmy[1].padStart(2, '0');
        const mon = monthMap[dmy[2].slice(0, 3)] || '01';
        const yr = dmy[3];
        return `${yr}-${mon}-${day}`;
      }

      const my = upper.match(/^([A-Z]{3,4})\s+(\d{4})$/);
      if (my) {
        const mon = monthMap[my[1].slice(0, 3)] || '01';
        const yr = my[2];
        return `${yr}-${mon}`;
      }

      const y = upper.match(/\b(\d{4})\b/);
      if (y) return y[1];

      return str;
    };

    const text = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawLines = text.split('\n');

    const rootRecords = [];
    const stack = [];

    for (let line of rawLines) {
      line = line.trim();
      if (!line) continue;

      const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
      if (!m) continue;

      const level = parseInt(m[1], 10);
      const xref = m[2] || null;
      const tag = (m[3] || '').toUpperCase();
      const value = m[4] !== undefined ? m[4].trim() : '';

      const node = { level, xref, tag, value, children: [] };

      if (level === 0) {
        rootRecords.push(node);
        stack.length = 0;
        stack.push(node);
      } else {
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        if (stack.length > 0) {
          const parent = stack[stack.length - 1];
          if (tag === 'CONC') {
            parent.value = (parent.value || '') + value;
          } else if (tag === 'CONT') {
            parent.value = (parent.value || '') + '\n' + value;
          } else {
            parent.children.push(node);
            stack.push(node);
          }
        }
      }
    }

    const indiNodes = rootRecords.filter(r => r.tag === 'INDI' || (r.xref && r.value === 'INDI'));
    const famNodes = rootRecords.filter(r => r.tag === 'FAM' || (r.xref && r.value === 'FAM'));

    const peopleMap = new Map();

    indiNodes.forEach(ind => {
      const rawId = ind.xref || ind.tag;
      const id = rawId.replace(/@/g, '');

      let nombre = '';
      let apellidos = '';
      let genero = 'O';
      let fechaNacimiento = '';
      let lugarNacimiento = '';
      let vive = true;
      let fechaFallecimiento = '';
      let lugarFallecimiento = '';
      let profesion = '';
      let notas = '';

      ind.children.forEach(c => {
        if (c.tag === 'NAME') {
          const fullVal = c.value || '';
          const matchSurname = fullVal.match(/\/([^/]*)\//);
          if (matchSurname) {
            apellidos = matchSurname[1].trim();
            nombre = fullVal.replace(/\/[^/]*\//, '').trim();
          } else {
            nombre = fullVal.trim();
          }

          c.children.forEach(sub => {
            if (sub.tag === 'GIVN' && sub.value) nombre = sub.value.trim();
            if (sub.tag === 'SURN' && sub.value) apellidos = sub.value.trim();
          });
        } else if (c.tag === 'SEX') {
          const s = (c.value || '').toUpperCase();
          if (s.startsWith('M')) genero = 'M';
          else if (s.startsWith('F')) genero = 'F';
          else genero = 'O';
        } else if (c.tag === 'BIRT') {
          c.children.forEach(sub => {
            if (sub.tag === 'DATE') fechaNacimiento = parseGedDate(sub.value);
            if (sub.tag === 'PLAC') lugarNacimiento = sub.value.trim();
          });
        } else if (c.tag === 'DEAT') {
          vive = false;
          c.children.forEach(sub => {
            if (sub.tag === 'DATE') {
              if (sub.value && sub.value.toUpperCase() !== 'Y') {
                fechaFallecimiento = parseGedDate(sub.value);
              }
            }
            if (sub.tag === 'PLAC') lugarFallecimiento = sub.value.trim();
          });
        } else if (c.tag === 'OCCU') {
          profesion = c.value.trim();
        } else if (c.tag === 'NOTE') {
          notas = (notas ? notas + '\n' : '') + (c.value || '').trim();
        }
      });

      if (fechaNacimiento && vive) {
        const y = parseInt(fechaNacimiento.slice(0, 4), 10);
        if (y && (new Date().getFullYear() - y > 115)) {
          vive = false;
        }
      }

      peopleMap.set(id, {
        id,
        nombre: nombre || 'Sin nombre',
        apellidos: apellidos || '',
        genero,
        fechaNacimiento,
        lugarNacimiento,
        vive,
        fechaFallecimiento,
        lugarFallecimiento,
        profesion,
        padreId: null,
        madreId: null,
        parejaId: null,
        foto: '',
        notas
      });
    });

    famNodes.forEach(fam => {
      let husbId = null;
      let wifeId = null;
      const childrenIds = [];

      fam.children.forEach(c => {
        const cleanVal = (c.value || '').replace(/@/g, '');
        if (c.tag === 'HUSB') husbId = cleanVal;
        else if (c.tag === 'WIFE') wifeId = cleanVal;
        else if (c.tag === 'CHIL') childrenIds.push(cleanVal);
      });

      childrenIds.forEach(cId => {
        const child = peopleMap.get(cId);
        if (child) {
          if (husbId && peopleMap.has(husbId)) child.padreId = husbId;
          if (wifeId && peopleMap.has(wifeId)) child.madreId = wifeId;
        }
      });

      if (husbId && wifeId) {
        const h = peopleMap.get(husbId);
        const w = peopleMap.get(wifeId);
        if (h && w) {
          if (!h.parejaId) h.parejaId = wifeId;
          if (!w.parejaId) w.parejaId = husbId;
        }
      }
    });

    const personas = Array.from(peopleMap.values());
    if (personas.length === 0) {
      throw new Error('No se encontraron registros de personas (INDI) en el archivo GEDCOM.');
    }

    // Persona raíz: preferir personas que tengan descendientes o antepasados
    let personaRaizId = personas[0].id;
    const connectedPerson = personas.find(p => (p.padreId || p.madreId) && p.parejaId);
    if (connectedPerson) personaRaizId = connectedPerson.id;

    return {
      config: {
        titulo: 'Árbol Genealógico Importado (GEDCOM)',
        personaRaizId
      },
      personas
    };
  }

  handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = (file.name || '').toLowerCase();
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        let finalData = null;
        let formatLabel = '';

        const trimmed = (text || '').trim();
        const isLikelyJson = trimmed.startsWith('{') || trimmed.startsWith('[');
        const isGedcom = fileName.endsWith('.ged') || fileName.endsWith('.gedcom') || trimmed.startsWith('0 ') || trimmed.includes('INDI');

        if (isLikelyJson && !isGedcom) {
          const parsed = JSON.parse(text);
          if (parsed && Array.isArray(parsed.personas)) {
            finalData = parsed;
            formatLabel = 'en formato JSON de la aplicación';
          } else if (parsed && Array.isArray(parsed.persons)) {
            finalData = this.parseGedcomX(parsed);
            formatLabel = 'en formato internacional GEDCOM X (JSON)';
          } else {
            alert('El archivo JSON no tiene un formato válido (debe contener "personas" o formato estándar GEDCOM X con "persons").');
            return;
          }
        } else {
          // Parsear como estándar internacional GEDCOM (.ged)
          finalData = this.parseTraditionalGedcom(text);
          formatLabel = 'en estándar internacional GEDCOM (.ged 5.5.1)';
        }

        if (confirm(`Se han detectado ${finalData.personas.length} personas ${formatLabel}. ¿Deseas reemplazar el árbol actual con estos datos?`)) {
          this.treeData = finalData;
          this.saveToLocalStorage();
          this.treeRenderer.setData(this.treeData);
          this.renderDirectoryList();
          this.updateStats();
          this.showToast(`Se cargaron ${finalData.personas.length} personas con éxito (${formatLabel})`);
        }
      } catch (err) {
        alert('Error al leer el archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  }

  openRawJsonModal() {
    const textarea = document.getElementById('rawJsonTextarea');
    textarea.value = JSON.stringify(this.treeData, null, 2);
    this.showModal('rawJsonModal');
  }

  applyRawJson() {
    const textarea = document.getElementById('rawJsonTextarea');
    try {
      const parsed = JSON.parse(textarea.value);
      if (!parsed || !Array.isArray(parsed.personas)) {
        alert('Formato inválido: el objeto debe contener una propiedad "personas" de tipo array.');
        return;
      }
      this.treeData = parsed;
      this.saveToLocalStorage();
      this.treeRenderer.setData(this.treeData);
      this.renderDirectoryList();
      this.updateStats();
      this.closeAllModals();
      this.showToast('JSON aplicado y guardado con éxito');
    } catch (err) {
      alert('Error de sintaxis en el JSON: ' + err.message);
    }
  }

  // ==========================================
  // HELPERS DE MODAL, TOAST Y FECHAS
  // ==========================================
  showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.editingPersonId = null;
    this.quickAddContext = null;
  }

  showToast(message) {
    const toast = document.getElementById('appToast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3000);
  }

  updateStats() {
    const total = (this.treeData && Array.isArray(this.treeData.personas)) ? this.treeData.personas.length : 0;
    const statsEl = document.getElementById('headerTreeStats');
    if (statsEl) {
      if (total === 0) {
        statsEl.textContent = '0 familiares';
      } else if (total === 1) {
        statsEl.textContent = '1 familiar';
      } else {
        statsEl.textContent = `${total} familiares`;
      }
    }
  }

  formatDateWithPlace(dateStr, place) {
    let res = '';
    if (dateStr) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        res = `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        res = dateStr;
      }
    }
    if (place) {
      res += (res ? ' en ' : '') + place;
    }
    return res || 'Fecha no registrada';
  }

  calculateAgeString(person) {
    if (!person.fechaNacimiento) return 'Edad desconocida';

    const birth = new Date(person.fechaNacimiento);
    if (isNaN(birth.getTime())) {
      // Si solo es año
      const birthYear = parseInt(person.fechaNacimiento, 10);
      if (!isNaN(birthYear)) {
        if (person.fechaFallecimiento) {
          const deathYear = parseInt(person.fechaFallecimiento, 10);
          return !isNaN(deathYear) ? `Vivió ~${deathYear - birthYear} años` : 'Fallecido';
        }
        return `~${new Date().getFullYear() - birthYear} años`;
      }
      return 'Edad desconocida';
    }

    const end = person.fechaFallecimiento ? new Date(person.fechaFallecimiento) : new Date();
    let age = end.getFullYear() - birth.getFullYear();
    const m = end.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) {
      age--;
    }

    if (person.fechaFallecimiento) {
      return `Falleció a los ${age} años`;
    } else {
      return `${age} años (Vive)`;
    }
  }
}

// Inicializar al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  window.app = new GenealogyApp();
});
