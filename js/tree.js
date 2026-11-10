/**
 * TreeRenderer: Motor de cálculo y renderizado del árbol genealógico.
 * Soporta vista Pedigrí (Ascendientes - estilo FamilySearch),
 * vista de Descendientes, y navegación interactiva con Pan & Zoom.
 */

class TreeRenderer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.canvas = document.getElementById('treeCanvas');
    this.svg = document.getElementById('treeConnections');
    this.nodesContainer = document.getElementById('treeNodes');
    
    this.options = Object.assign({
      cardWidth: 230,
      cardHeight: 90,
      horizontalGap: 75,
      verticalGap: 24,
      maxPedigreeGenerations: 4 // Raíz + Padres + Abuelos + Bisabuelos
    }, options);

    this.scale = 1;
    this.translateX = 60;
    this.translateY = 60;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;
    
    this.currentMode = 'pedigree'; // 'pedigree' | 'descendants'
    this.rootPersonId = null;
    this.peopleMap = new Map();
    this.expandedAncestorIds = new Set(); // IDs de personas cuyos antepasados están expandidos más allá de Gen 3
    this.simultaneousRootIds = new Set(); // IDs de familiares cuyos árboles se muestran simultáneamente
    this.showAncestorSiblings = true; // Mostrar hermanos de antepasados (tíos, tíos-abuelos...) activado por defecto
    this.expandedSiblingIds = new Set(); // Control individual por tarjeta
    this.collapsedSiblingIds = new Set(); // Control de colapso individual cuando está activo globalmente
    this.isFullTreeExpanded = false; // Modo Árbol Completo
    this.showAllDescendants = false; // Si cónyuges e hijos colaterales se expanden globalmente
    this.expandedSiblingFamilyIds = new Set(); // Cónyuges e hijos expandidos individualmente por tarjeta
    this.collapsedSiblingFamilyIds = new Set(); // Control de colapso individual cuando está activo globalmente
    
    this.initEvents();
    this.initTooltip();
    this.updateTransform();
  }

  initEvents() {
    // Pan & Zoom en el contenedor
    this.container.addEventListener('mousedown', (e) => {
      // Ignorar si se hace clic sobre una tarjeta o botón
      if (e.target.closest('.person-card') || e.target.closest('button') || e.target.closest('.placeholder-card')) {
        return;
      }
      this.isPanning = true;
      this.startX = e.clientX - this.translateX;
      this.startY = e.clientY - this.translateY;
      this.container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this.updateTransform();
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.style.cursor = 'grab';
      }
    });

    // Zoom con rueda de ratón
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoomAtPoint(zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    // Soporte táctil básico (touch)
    let initialTouchDist = null;
    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1 && !e.target.closest('.person-card') && !e.target.closest('.placeholder-card')) {
        this.isPanning = true;
        this.startX = e.touches[0].clientX - this.translateX;
        this.startY = e.touches[0].clientY - this.translateY;
      } else if (e.touches.length === 2) {
        this.isPanning = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialTouchDist = Math.hypot(dx, dy);
      }
    });

    this.container.addEventListener('touchmove', (e) => {
      if (this.isPanning && e.touches.length === 1) {
        this.translateX = e.touches[0].clientX - this.startX;
        this.translateY = e.touches[0].clientY - this.startY;
        this.updateTransform();
      } else if (e.touches.length === 2 && initialTouchDist) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const factor = dist / initialTouchDist;
        if (factor > 0.5 && factor < 2) {
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          this.zoomAtPoint(factor > 1 ? 1.03 : 0.97, midX, midY);
        }
        initialTouchDist = dist;
      }
    }, { passive: false });

    this.container.addEventListener('touchend', () => {
      this.isPanning = false;
      initialTouchDist = null;
    });
  }

  // ==========================================
  // TOOLTIP FLOTANTE DE NOMBRE COMPLETO
  // ==========================================
  initTooltip() {
    let tooltip = document.getElementById('cardFloatingTooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'cardFloatingTooltip';
      tooltip.className = 'card-floating-tooltip';
      this.container.appendChild(tooltip);
    }
    this.tooltipEl = tooltip;

    let hoverTimeout = null;

    this.container.addEventListener('mouseover', (e) => {
      const card = e.target.closest('.person-card');
      if (card && card.dataset.id) {
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
          this.showCardTooltip(card);
        }, 100); // 100ms para una aparición inmediata y suave
      }
    });

    this.container.addEventListener('mouseout', (e) => {
      const card = e.target.closest('.person-card');
      if (card && (!e.relatedTarget || !card.contains(e.relatedTarget))) {
        clearTimeout(hoverTimeout);
        this.hideCardTooltip();
      }
    });

    // Ocultar al arrastrar el lienzo o cambiar de zoom
    this.container.addEventListener('mousedown', () => this.hideCardTooltip());
    this.container.addEventListener('wheel', () => this.hideCardTooltip(), { passive: true });
  }

  showCardTooltip(card) {
    if (!this.tooltipEl || !card) return;
    const personId = card.dataset.id;
    const person = this.peopleMap.get(String(personId));
    if (!person) return;

    const fullName = `${person.nombre} ${person.apellidos || ''}`.trim();
    const lifeSpan = this.formatLifeSpan(person);
    const place = person.lugarNacimiento || person.lugarFallecimiento || '';
    const badgeEl = card.querySelector('.card-gen-badge');
    const badgeText = badgeEl ? badgeEl.textContent.trim() : '';

    this.tooltipEl.innerHTML = `
      <div class="tooltip-name">${fullName}</div>
      <div class="tooltip-meta">
        ${badgeText ? `<span class="tooltip-badge">${badgeText}</span>` : ''}
        <span class="tooltip-dates">${lifeSpan}</span>
      </div>
      ${place ? `<div class="tooltip-place">📍 ${place}</div>` : ''}
    `;

    // Posicionamiento flotante respecto al contenedor
    const containerRect = this.container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    const cardCenterX = (cardRect.left - containerRect.left) + (cardRect.width / 2);
    const cardTopY = cardRect.top - containerRect.top;
    const cardBottomY = cardRect.bottom - containerRect.top;

    // Decidir si colocar arriba o abajo según proximidad al borde superior
    const placeAbove = cardTopY > 90;
    this.tooltipEl.classList.remove('pos-top', 'pos-bottom');

    if (placeAbove) {
      this.tooltipEl.classList.add('pos-top');
      this.tooltipEl.style.left = `${cardCenterX}px`;
      this.tooltipEl.style.top = `${cardTopY - 10}px`;
      this.tooltipEl.style.transform = 'translate(-50%, -100%)';
    } else {
      this.tooltipEl.classList.add('pos-bottom');
      this.tooltipEl.style.left = `${cardCenterX}px`;
      this.tooltipEl.style.top = `${cardBottomY + 10}px`;
      this.tooltipEl.style.transform = 'translate(-50%, 0)';
    }

    this.tooltipEl.classList.add('visible');
  }

  hideCardTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.classList.remove('visible');
    }
  }

  updateTransform() {
    this.hideCardTooltip();
    this.canvas.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
  }

  zoomAtPoint(factor, clientX, clientY) {
    const newScale = Math.min(Math.max(this.scale * factor, 0.3), 2.5);
    if (newScale === this.scale) return;

    const rect = this.container.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    // Ajustar traslación para hacer zoom centrado en el cursor
    this.translateX = mouseX - (mouseX - this.translateX) * (newScale / this.scale);
    this.translateY = mouseY - (mouseY - this.translateY) * (newScale / this.scale);
    this.scale = newScale;
    this.updateTransform();
  }

  zoomIn() {
    const rect = this.container.getBoundingClientRect();
    this.zoomAtPoint(1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  zoomOut() {
    const rect = this.container.getBoundingClientRect();
    this.zoomAtPoint(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  resetView() {
    this.scale = 1;
    this.translateX = 80;
    // Centrar verticalmente en relación al contenedor
    const containerH = this.container.clientHeight;
    this.translateY = Math.max(30, (containerH / 2) - 250);
    this.updateTransform();
  }

  setData(data, rootId = null) {
    this.data = data;
    this.peopleMap.clear();
    (data.personas || []).forEach(p => this.peopleMap.set(String(p.id), p));
    
    // Limpiar IDs inexistentes de vistas simultáneas y expansiones
    for (const simId of this.simultaneousRootIds) {
      if (!this.peopleMap.has(String(simId))) {
        this.simultaneousRootIds.delete(simId);
      }
    }
    for (const expId of this.expandedAncestorIds) {
      if (!this.peopleMap.has(String(expId))) {
        this.expandedAncestorIds.delete(expId);
      }
    }
    for (const famId of this.expandedSiblingFamilyIds) {
      if (!this.peopleMap.has(String(famId))) {
        this.expandedSiblingFamilyIds.delete(famId);
      }
    }

    if (rootId && this.peopleMap.has(String(rootId))) {
      this.rootPersonId = String(rootId);
    } else if (data.config && data.config.personaRaizId && this.peopleMap.has(String(data.config.personaRaizId))) {
      this.rootPersonId = String(data.config.personaRaizId);
    } else if (data.personas && data.personas.length > 0) {
      this.rootPersonId = String(data.personas[0].id);
    } else {
      this.rootPersonId = null;
    }

    this.render();
  }

  setMode(mode) {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.render();
      this.resetView();
    }
  }

  setRootPerson(id) {
    if (this.peopleMap.has(String(id))) {
      this.rootPersonId = String(id);
      // Si la persona era una raíz simultánea, quitarla porque ahora es la principal
      this.simultaneousRootIds.delete(String(id));
      this.render();
      window.dispatchEvent(new CustomEvent('root-changed', { detail: { id: this.rootPersonId } }));
    }
  }

  toggleAncestorExpansion(personId) {
    const sId = String(personId);
    if (this.expandedAncestorIds.has(sId)) {
      this.expandedAncestorIds.delete(sId);
    } else {
      this.expandedAncestorIds.add(sId);
    }
    this.render();
  }

  expandAllAncestors() {
    this.toggleFullTreeExpansion(true);
  }

  collapseAncestors() {
    this.isFullTreeExpanded = false;
    this.showAllDescendants = false;
    this.expandedAncestorIds.clear();
    this.expandedSiblingFamilyIds.clear();
    this.collapsedSiblingFamilyIds.clear();
    this.collapsedSiblingIds.clear();
    this.expandedSiblingIds.clear();
    this.render();
  }

  toggleFullTreeExpansion(forceState = null) {
    if (forceState !== null) {
      this.isFullTreeExpanded = forceState;
    } else {
      this.isFullTreeExpanded = !this.isFullTreeExpanded;
    }

    this.showAncestorSiblings = true;
    this.showAllDescendants = this.isFullTreeExpanded;
    this.expandedSiblingIds.clear();
    this.collapsedSiblingIds.clear();
    this.expandedSiblingFamilyIds.clear();
    this.collapsedSiblingFamilyIds.clear();

    if (this.isFullTreeExpanded) {
      // Expandir todos los antepasados con padres registrados
      for (const p of this.peopleMap.values()) {
        if (p.padreId || p.madreId) {
          this.expandedAncestorIds.add(String(p.id));
        }
      }
    } else {
      this.expandedAncestorIds.clear();
    }

    this.render();
    this.resetView();
    return this.isFullTreeExpanded;
  }

  toggleSimultaneousTree(personId) {
    const sId = String(personId);
    if (sId === String(this.rootPersonId)) return; // No puede ser simultáneo consigo mismo
    if (this.simultaneousRootIds.has(sId)) {
      this.simultaneousRootIds.delete(sId);
    } else {
      this.simultaneousRootIds.add(sId);
    }
    this.render();
  }

  // ==========================================
  // GESTIÓN DE HERMANOS Y FAMILIAS COLATERALES
  // ==========================================
  getSiblings(person) {
    if (!person || (!person.padreId && !person.madreId)) return [];
    return Array.from(this.peopleMap.values()).filter(other => 
      String(other.id) !== String(person.id) && (
        (person.padreId && String(other.padreId) === String(person.padreId)) ||
        (person.madreId && String(other.madreId) === String(person.madreId))
      )
    );
  }

  getSiblingLabel(gen) {
    if (gen === 0) return 'Hermano/a';
    if (gen === 1) return 'Tío/a';
    if (gen === 2) return 'Tío/a Abuelo/a';
    if (gen === 3) return 'Tío/a Bisabuelo/a';
    return `Colateral (Gen ${gen + 1})`;
  }

  getCollateralKinshipLabel(ancestorGen, depth) {
    if (ancestorGen === 0) {
      if (depth === 1) return 'Sobrino/a';
      if (depth === 2) return 'Sobrino/a Nieto/a';
      return `Descendiente (${depth}ª gen)`;
    }
    if (ancestorGen === 1) {
      if (depth === 1) return 'Primo/a Hermano/a';
      if (depth === 2) return 'Sobrino/a Segundo/a';
      return `Descendiente (${depth}ª gen)`;
    }
    if (ancestorGen === 2) {
      if (depth === 1) return 'Tío/a Segundo/a';
      if (depth === 2) return 'Primo/a Segundo/a';
      return `Descendiente (${depth}ª gen)`;
    }
    return `Colateral Descendiente`;
  }

  isSiblingExpanded(personId) {
    if (!personId) return false;
    const sId = String(personId);
    if (this.showAncestorSiblings) {
      return !this.collapsedSiblingIds.has(sId);
    } else {
      return this.expandedSiblingIds.has(sId);
    }
  }

  toggleSiblingExpansion(personId) {
    const sId = String(personId);
    if (this.showAncestorSiblings) {
      if (this.collapsedSiblingIds.has(sId)) {
        this.collapsedSiblingIds.delete(sId);
      } else {
        this.collapsedSiblingIds.add(sId);
      }
    } else {
      if (this.expandedSiblingIds.has(sId)) {
        this.expandedSiblingIds.delete(sId);
      } else {
        this.expandedSiblingIds.add(sId);
      }
    }
    this.render();
  }

  toggleAllAncestorSiblings() {
    this.showAncestorSiblings = !this.showAncestorSiblings;
    this.collapsedSiblingIds.clear();
    this.expandedSiblingIds.clear();
    this.render();
    return this.showAncestorSiblings;
  }

  isSiblingFamilyExpanded(personId) {
    if (!personId) return false;
    const sId = String(personId);
    if (this.showAllDescendants || this.isFullTreeExpanded) {
      return !this.collapsedSiblingFamilyIds.has(sId);
    } else {
      return this.expandedSiblingFamilyIds.has(sId);
    }
  }

  toggleSiblingFamilyExpansion(personId) {
    const sId = String(personId);
    if (this.showAllDescendants || this.isFullTreeExpanded) {
      if (this.collapsedSiblingFamilyIds.has(sId)) {
        this.collapsedSiblingFamilyIds.delete(sId);
      } else {
        this.collapsedSiblingFamilyIds.add(sId);
      }
    } else {
      if (this.expandedSiblingFamilyIds.has(sId)) {
        this.expandedSiblingFamilyIds.delete(sId);
      } else {
        this.expandedSiblingFamilyIds.add(sId);
      }
    }
    this.render();
  }

  buildFamilySubTree(person, depth = 0, maxDepth = 6) {
    if (!person) return null;
    const idStr = String(person.id);
    const spouse = person.parejaId ? this.peopleMap.get(String(person.parejaId)) : null;
    const children = Array.from(this.peopleMap.values()).filter(p =>
      String(p.padreId) === idStr || String(p.madreId) === idStr
    );
    const hasSpouse = !!spouse;
    const isExpanded = this.isSiblingFamilyExpanded(person.id);
    const hasFamily = hasSpouse || children.length > 0;
    
    // Altura del bloque pareja: si tiene cónyuge y está expandido se muestra la pareja completa
    const isCoupleVisible = hasSpouse && isExpanded;
    const unitH = isCoupleVisible ? (this.options.cardHeight * 2 + 10) : this.options.cardHeight;
    
    const childNodes = (isExpanded && depth < maxDepth)
      ? children.map(c => this.buildFamilySubTree(c, depth + 1, maxDepth)).filter(Boolean)
      : [];

    return {
      person,
      spouse,
      hasSpouse,
      isCoupleVisible,
      unitH,
      children: childNodes,
      allChildren: children,
      childCount: children.length,
      hasFamily,
      isExpanded,
      depth,
      totalH: 0,
      x: 0,
      y: 0,
      spouseY: 0
    };
  }

  computeSubTreeHeight(stNode) {
    if (!stNode) return 0;
    if (!stNode.children || stNode.children.length === 0) {
      stNode.totalH = stNode.unitH;
      return stNode.totalH;
    }
    let childrenH = 0;
    const gapY = this.options.verticalGap;
    stNode.children.forEach((c, idx) => {
      childrenH += this.computeSubTreeHeight(c);
      if (idx < stNode.children.length - 1) childrenH += gapY;
    });
    stNode.totalH = Math.max(stNode.unitH, childrenH);
    return stNode.totalH;
  }

  layoutSubTree(stNode, startX, startY) {
    if (!stNode) return;
    const cardW = this.options.cardWidth;
    const cardH = this.options.cardHeight;
    const gapX = this.options.horizontalGap;
    const gapY = this.options.verticalGap;

    stNode.x = startX;
    stNode.y = startY + (stNode.totalH - stNode.unitH) / 2;
    if (stNode.isCoupleVisible) {
      stNode.spouseY = stNode.y + cardH + 10;
    }

    if (stNode.children && stNode.children.length > 0) {
      let currY = startY;
      const childX = startX + cardW + gapX;
      stNode.children.forEach(c => {
        this.layoutSubTree(c, childX, currY);
        currY += c.totalH + gapY;
      });
    }
  }

  drawMarriageLine(x, y1, y2) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x);
    line.setAttribute('y2', y2);
    line.setAttribute('class', 'tree-connector-marriage');
    this.svg.appendChild(line);
  }

  // Corchete de unión conyugal en el lado derecho hacia los hijos comunes
  drawCoupleChildrenConnector(partnerX, partnerY, spouseY, cardW, cardH, children) {
    if (!children || children.length === 0) return;
    const rightX = partnerX + cardW;
    const forkX = rightX + 16;
    const pMidY = partnerY + cardH / 2;
    const sMidY = spouseY + cardH / 2;
    const branchMidY = (pMidY + sMidY) / 2;

    // Corchete curvo que abraza los lados derechos de ambos cónyuges
    const bracketPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const r = 6;
    const bracketD = `M ${rightX} ${pMidY} H ${forkX - r} Q ${forkX} ${pMidY} ${forkX} ${pMidY + r} V ${sMidY - r} Q ${forkX} ${sMidY} ${forkX - r} ${sMidY} H ${rightX}`;
    bracketPath.setAttribute('d', bracketD);
    bracketPath.setAttribute('class', 'tree-connector tree-connector-couple');
    this.svg.appendChild(bracketPath);

    // Conector bezier hacia cada hijo desde el centro de la unión de la pareja
    children.forEach(childNode => {
      const childStartX = childNode.x;
      const childMidY = childNode.y + cardH / 2;
      this.drawConnection(forkX, branchMidY, childStartX, childMidY);
    });
  }

  drawSiblingConnection(x1, y1, x2, y2) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dx = Math.abs(x2 - x1) * 0.5;
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    path.setAttribute('d', d);
    path.setAttribute('class', 'tree-connector tree-connector-sibling');
    this.svg.appendChild(path);
  }

  drawSiblingBracket(x1, y1, x2, y2) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const bracketX = Math.min(x1, x2) - 18;
    const r = 8;
    const d = `M ${x1} ${y1} H ${bracketX + r} Q ${bracketX} ${y1} ${bracketX} ${y1 + r} V ${y2 - r} Q ${bracketX} ${y2} ${bracketX + r} ${y2} H ${x2}`;
    path.setAttribute('d', d);
    path.setAttribute('class', 'tree-connector tree-connector-sibling');
    this.svg.appendChild(path);
  }

  render() {
    this.hideCardTooltip();
    // Limpiar canvas de forma limpia y segura
    this.nodesContainer.innerHTML = '';
    while (this.svg.firstChild) {
      this.svg.removeChild(this.svg.firstChild);
    }

    if (!this.rootPersonId || !this.peopleMap.has(this.rootPersonId)) {
      this.nodesContainer.innerHTML = `
        <div class="empty-tree-notice">
          <div class="empty-tree-icon">🌱</div>
          <h3>Tu árbol genealógico está vacío</h3>
          <p>Comienza añadiendo a la primera persona para iniciar tu historia familiar.</p>
          <button class="btn-primary" onclick="window.app.openAddModal()">+ Añadir Primera Persona</button>
        </div>
      `;
      return;
    }

    if (this.currentMode === 'pedigree') {
      this.renderPedigreeView();
    } else if (this.currentMode === 'descendants') {
      this.renderDescendantsView();
    }
  }

  // ==========================================
  // MODO PEDIGRÍ (ESTILO FAMILYSEARCH PORTRAIT)
  // ==========================================
  renderPedigreeView() {
    const rootPerson = this.peopleMap.get(this.rootPersonId);
    if (!rootPerson) return;

    let currentBaseY = 40;
    const startX = 40;

    // 1. Renderizar árbol principal (centrado en la persona raíz)
    const primaryResult = this.renderSinglePedigreeTree(rootPerson, startX, currentBaseY, false);
    
    // Panel de familia inmediata debajo del árbol principal
    const familyBoxY = Math.max(primaryResult.maxY + 30, primaryResult.rootY + this.options.cardHeight + 25);
    const familyBoxHeight = this.renderRootImmediateFamily(rootPerson, startX, familyBoxY);

    currentBaseY = Math.max(primaryResult.maxY, familyBoxY + familyBoxHeight) + 80;

    // 2. Renderizar árboles simultáneos seleccionados
    for (const simId of this.simultaneousRootIds) {
      const simPerson = this.peopleMap.get(simId);
      if (!simPerson) continue;

      // Banner divisorio de árbol simultáneo
      const bannerEl = this.createSimultaneousBanner(simPerson, rootPerson, startX, currentBaseY);
      this.nodesContainer.appendChild(bannerEl);
      currentBaseY += 75;

      // Renderizar el árbol genealógico del familiar simultáneo
      const simResult = this.renderSinglePedigreeTree(simPerson, startX, currentBaseY, true);
      currentBaseY = simResult.maxY + 80;
    }
  }

  // Renderiza un árbol de pedigrí completo (principal o simultáneo) con expansión recursiva sin mover el centro
  renderSinglePedigreeTree(rootPerson, startX, baseStartY, isSimultaneous = false) {
    const cardW = this.options.cardWidth;
    const cardH = this.options.cardHeight;
    const gapX = this.options.horizontalGap;
    const gapY = this.options.verticalGap;
    const maxDefaultGen = this.options.maxPedigreeGenerations - 1; // 3 (Gen 0, 1, 2, 3)

    // 1. Construir jerarquía visible de antepasados y sus ramas de hermanos colaterales
    const buildAncestorTree = (person, gen = 0, relationType = null, childId = null) => {
      if (!person) {
        if (gen <= maxDefaultGen) {
          return { person: null, gen, relationType, childId, isLeaf: true, fatherNode: null, motherNode: null, allSiblings: [], hasSiblings: false, isSiblingExpanded: false, visibleSiblingTrees: [] };
        }
        return null;
      }

      const isExpanded = (gen < maxDefaultGen) || this.expandedAncestorIds.has(String(person.id));
      const father = person.padreId ? this.peopleMap.get(String(person.padreId)) : null;
      const mother = person.madreId ? this.peopleMap.get(String(person.madreId)) : null;
      const hasKnownParents = !!(person.padreId || person.madreId);

      // Hermanos del antepasado (colaterales en este nivel generacional) y sus familias (cónyuges e hijos)
      const allSiblings = this.getSiblings(person);
      const hasSiblings = allSiblings.length > 0;
      const isSiblingExpanded = this.isSiblingExpanded(person.id);
      const visibleSiblingTrees = isSiblingExpanded 
        ? allSiblings.map(sib => this.buildFamilySubTree(sib, 0)).filter(Boolean)
        : [];
      visibleSiblingTrees.forEach(st => {
        st.siblingOf = person;
        this.computeSubTreeHeight(st);
      });

      if (isExpanded) {
        if (gen < maxDefaultGen) {
          const fatherNode = buildAncestorTree(father, gen + 1, 'padre', person.id);
          const motherNode = buildAncestorTree(mother, gen + 1, 'madre', person.id);
          return { person, gen, relationType, childId, isLeaf: false, isExpanded: true, fatherNode, motherNode, hasKnownParents, allSiblings, hasSiblings, isSiblingExpanded, visibleSiblingTrees };
        } else {
          if (!father && !mother) {
            return { person, gen, relationType, childId, isLeaf: true, isExpanded: false, hasKnownParents: false, allSiblings, hasSiblings, isSiblingExpanded, visibleSiblingTrees };
          }
          const fatherNode = father ? buildAncestorTree(father, gen + 1, 'padre', person.id) : null;
          const motherNode = mother ? buildAncestorTree(mother, gen + 1, 'madre', person.id) : null;
          return { person, gen, relationType, childId, isLeaf: false, isExpanded: true, fatherNode, motherNode, hasKnownParents, allSiblings, hasSiblings, isSiblingExpanded, visibleSiblingTrees };
        }
      }

      return { person, gen, relationType, childId, isLeaf: true, isExpanded: false, hasKnownParents, allSiblings, hasSiblings, isSiblingExpanded, visibleSiblingTrees };
    };

    const treeHierarchy = buildAncestorTree(rootPerson, 0);

    // 2. Calcular posiciones Y reservando espacio para antepasados, hermanos y sus familias completas
    let currentLeafY = baseStartY;
    const positionNode = (node) => {
      if (!node) return;
      if (node.isLeaf) {
        node.x = startX + node.gen * (cardW + gapX);
        node.y = currentLeafY;
        currentLeafY += cardH + gapY;

        // Ubicar hermanos visibles y sus familias completas (cónyuges y descendencia)
        node.siblingTrees = [];
        if (node.visibleSiblingTrees && node.visibleSiblingTrees.length > 0) {
          node.visibleSiblingTrees.forEach(st => {
            this.layoutSubTree(st, node.x, currentLeafY);
            currentLeafY += st.totalH + gapY;
            node.siblingTrees.push(st);
          });
        }
      } else {
        if (node.fatherNode) positionNode(node.fatherNode);
        if (node.motherNode) positionNode(node.motherNode);

        node.x = startX + node.gen * (cardW + gapX);
        if (node.fatherNode && node.motherNode) {
          node.y = (node.fatherNode.y + node.motherNode.y) / 2;
        } else if (node.fatherNode) {
          node.y = node.fatherNode.y;
        } else if (node.motherNode) {
          node.y = node.motherNode.y;
        }

        // Ubicar hermanos visibles y sus familias completas (cónyuges y descendencia)
        node.siblingTrees = [];
        if (node.visibleSiblingTrees && node.visibleSiblingTrees.length > 0) {
          node.visibleSiblingTrees.forEach(st => {
            this.layoutSubTree(st, node.x, currentLeafY);
            currentLeafY += st.totalH + gapY;
            node.siblingTrees.push(st);
          });
        }
      }
    };

    positionNode(treeHierarchy);

    // Renderiza recursivamente una rama familiar colateral (hermano -> cónyuge -> hijos -> nietos)
    const renderFamilySubTree = (stNode, ancestorGen, isRootSibling = true) => {
      if (!stNode) return;

      // 1. Tarjeta principal del hermano o pariente colateral
      const meta = {
        isSibling: isRootSibling,
        isCollateralDescendant: !isRootSibling,
        siblingOf: isRootSibling ? stNode.siblingOf : null,
        generationName: isRootSibling 
          ? this.getSiblingLabel(ancestorGen) 
          : this.getCollateralKinshipLabel(ancestorGen, stNode.depth),
        hasFamily: stNode.hasFamily,
        familyMemberCount: (stNode.hasSpouse ? 1 : 0) + stNode.childCount,
        isFamilyExpanded: stNode.isExpanded
      };

      const cardEl = this.createPersonCardElement(stNode.person, stNode.x, stNode.y, meta);
      this.nodesContainer.appendChild(cardEl);

      // 2. Tarjeta del cónyuge si existe y el bloque pareja está visible
      if (stNode.isCoupleVisible && stNode.spouse) {
        const spouseCard = this.createPersonCardElement(stNode.spouse, stNode.x, stNode.spouseY, {
          isSpouse: true,
          spouseOf: stNode.person,
          generationName: `💍 Cónyuge de ${stNode.person.nombre}`
        });
        this.nodesContainer.appendChild(spouseCard);

        // Badge y enlace visual de matrimonio entre ambas tarjetas
        const marriageBadge = document.createElement('div');
        marriageBadge.className = 'couple-marriage-badge';
        marriageBadge.style.left = `${stNode.x + 24}px`;
        marriageBadge.style.top = `${stNode.y + cardH - 1}px`;
        marriageBadge.innerHTML = '💍 Matrimonio';
        this.nodesContainer.appendChild(marriageBadge);

        this.drawMarriageLine(stNode.x + 18, stNode.y + cardH, stNode.spouseY);
      }

      // 3. Conectores hacia los hijos y renderizado recursivo de la descendencia
      if (stNode.children && stNode.children.length > 0) {
        if (stNode.isCoupleVisible && stNode.spouse) {
          // Si la pareja está visible, los hijos nacen de la unión común de ambos progenitores mediante corchete conyugal
          this.drawCoupleChildrenConnector(stNode.x, stNode.y, stNode.spouseY, cardW, cardH, stNode.children);
        } else {
          // Si no hay cónyuge visible, salen directamente del lateral del progenitor
          const parentEndX = stNode.x + cardW;
          const parentMidY = stNode.y + cardH / 2;
          stNode.children.forEach(childNode => {
            const childStartX = childNode.x;
            const childMidY = childNode.y + cardH / 2;
            this.drawConnection(parentEndX, parentMidY, childStartX, childMidY);
          });
        }

        stNode.children.forEach(childNode => {
          renderFamilySubTree(childNode, ancestorGen, false);
        });
      }
    };

    // 3. Renderizar nodos, conexiones de antepasados y ramas familiares colaterales
    const renderNodeAndConnectors = (node) => {
      if (!node) return;

      if (node.person) {
        const cardEl = this.createPersonCardElement(node.person, node.x, node.y, {
          isRoot: node.gen === 0,
          isSimultaneousRoot: node.gen === 0 && isSimultaneous,
          generationName: this.getGenerationLabel(node.gen),
          hasSiblings: node.hasSiblings,
          siblingCount: node.allSiblings ? node.allSiblings.length : 0,
          isSiblingExpanded: node.isSiblingExpanded
        });
        this.nodesContainer.appendChild(cardEl);

        // Flecha interactiva para expandir/contraer antepasados sin mover/centrar el árbol
        if (node.gen >= maxDefaultGen && node.hasKnownParents) {
          const expandBtn = document.createElement('button');
          expandBtn.className = `drill-down-indicator ${node.isExpanded ? 'expanded' : ''}`;
          expandBtn.title = node.isExpanded 
            ? `Contraer antepasados de ${node.person.nombre}` 
            : `Expandir visualmente antepasados de ${node.person.nombre} (${this.getGenerationLabel(node.gen + 1)})`;
          expandBtn.innerHTML = node.isExpanded ? '◀' : '➔';
          expandBtn.style.left = `${node.x + cardW + 6}px`;
          expandBtn.style.top = `${node.y + (cardH / 2) - 14}px`;
          expandBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleAncestorExpansion(node.person.id);
          };
          this.nodesContainer.appendChild(expandBtn);
        }
      } else {
        if (node.childId) {
          const placeholderEl = this.createPlaceholderCardElement(node.x, node.y, node.relationType, node.childId);
          this.nodesContainer.appendChild(placeholderEl);
        }
      }

      // Renderizar tarjetas de hermanos colaterales y sus familias completas (cónyuges y descendencia)
      if (node.siblingTrees && node.siblingTrees.length > 0) {
        node.siblingTrees.forEach(st => {
          renderFamilySubTree(st, node.gen, true);

          // Conexión visual del hermano con el nodo antepasado de su misma generación mediante corchete lateral limpio
          this.drawSiblingBracket(node.x, node.y + cardH / 2, st.x, st.y + cardH / 2);
        });
      }

      // Conexión SVG curva con el padre
      if (node.fatherNode) {
        this.drawConnection(
          node.x + cardW, node.y + cardH / 2,
          node.fatherNode.x, node.fatherNode.y + cardH / 2
        );
        renderNodeAndConnectors(node.fatherNode);
      }

      // Conexión SVG curva con la madre
      if (node.motherNode) {
        this.drawConnection(
          node.x + cardW, node.y + cardH / 2,
          node.motherNode.x, node.motherNode.y + cardH / 2
        );
        renderNodeAndConnectors(node.motherNode);
      }
    };

    renderNodeAndConnectors(treeHierarchy);

    return {
      rootY: treeHierarchy ? treeHierarchy.y : baseStartY,
      maxY: currentLeafY
    };
  }

  // Renderiza Cónyuge e Hijos junto a la persona raíz con botones para centrar o ver a la vez
  renderRootImmediateFamily(rootPerson, startX, startY) {
    if (!rootPerson) return 0;
    
    // Obtener cónyuge
    const spouse = rootPerson.parejaId ? this.peopleMap.get(String(rootPerson.parejaId)) : null;
    
    // Obtener hijos
    const children = Array.from(this.peopleMap.values()).filter(p => 
      String(p.padreId) === String(rootPerson.id) || String(p.madreId) === String(rootPerson.id)
    );

    // Obtener hermanos
    const siblings = Array.from(this.peopleMap.values()).filter(p => 
      String(p.id) !== String(rootPerson.id) && 
      ((rootPerson.padreId && String(p.padreId) === String(rootPerson.padreId)) ||
       (rootPerson.madreId && String(p.madreId) === String(rootPerson.madreId)))
    );

    const familyBox = document.createElement('div');
    familyBox.className = 'pedigree-family-panel';
    familyBox.style.left = `${startX}px`;
    familyBox.style.top = `${startY}px`;

    let html = `
      <div class="family-panel-header">
        <span class="family-panel-title">Familia Inmediata</span>
      </div>
      <div class="family-panel-content">
    `;

    const renderBadge = (p, roleLabel) => {
      const isSimultaneous = this.simultaneousRootIds.has(String(p.id));
      return `
        <div class="mini-person-badge ${isSimultaneous ? 'simultaneous-active' : ''}" data-id="${p.id}">
          <span class="mini-avatar ${p.genero === 'F' ? 'gender-f' : 'gender-m'}">${this.getInitials(p)}</span>
          <span class="mini-name" title="${p.nombre} ${p.apellidos || ''}">${p.nombre} ${p.apellidos || ''}</span>
          <div class="mini-badge-actions">
            <button class="mini-btn-center" title="Centrar árbol aquí" data-action="center" data-id="${p.id}">🎯</button>
            <button class="mini-btn-simultaneous ${isSimultaneous ? 'active' : ''}" 
                    title="${isSimultaneous ? 'Ocultar árbol simultáneo' : 'Visualizar su árbol a la vez'}" 
                    data-action="toggle-simultaneous" 
                    data-id="${p.id}">
              ${isSimultaneous ? '👁️‍🗨️' : '👁️'}
            </button>
          </div>
        </div>
      `;
    };

    // Cónyuge
    html += `<div class="family-subgroup">
      <div class="family-subgroup-label">Cónyuge / Pareja:</div>`;
    if (spouse) {
      html += renderBadge(spouse, 'Cónyuge');
    } else {
      html += `
        <button class="btn-add-mini" data-action="add-spouse" data-id="${rootPerson.id}">+ Añadir Cónyuge</button>
      `;
    }
    html += `</div>`;

    // Hijos
    html += `<div class="family-subgroup">
      <div class="family-subgroup-label">Hijos (${children.length}):</div>`;
    if (children.length > 0) {
      html += `<div class="mini-people-list">`;
      children.forEach(child => {
        html += renderBadge(child, 'Hijo/a');
      });
      html += `</div>`;
    }
    html += `<button class="btn-add-mini" data-action="add-child" data-id="${rootPerson.id}">+ Añadir Hijo/a</button>`;
    html += `</div>`;

    // Hermanos
    if (siblings.length > 0) {
      html += `<div class="family-subgroup">
        <div class="family-subgroup-label">Hermanos/as (${siblings.length}):</div>
        <div class="mini-people-list">`;
      siblings.forEach(sib => {
        html += renderBadge(sib, 'Hermano/a');
      });
      html += `</div></div>`;
    }

    html += `</div>`;
    familyBox.innerHTML = html;

    // Delegación de eventos en el panel de familia inmediata
    familyBox.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) {
        const badge = e.target.closest('.mini-person-badge');
        if (badge && badge.dataset.id) {
          window.dispatchEvent(new CustomEvent('person-select', { detail: { id: badge.dataset.id } }));
        }
        return;
      }
      e.stopPropagation();
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (action === 'center') {
        this.setRootPerson(id);
      } else if (action === 'toggle-simultaneous') {
        this.toggleSimultaneousTree(id);
      } else if (action === 'add-spouse') {
        window.dispatchEvent(new CustomEvent('quick-add', { detail: { type: 'spouse', personId: id } }));
      } else if (action === 'add-child') {
        window.dispatchEvent(new CustomEvent('quick-add', { detail: { type: 'child', personId: id } }));
      }
    });

    this.nodesContainer.appendChild(familyBox);
    return familyBox.offsetHeight || 220;
  }

  // Crea el banner de cabecera para un árbol simultáneo
  createSimultaneousBanner(simPerson, rootPerson, startX, startY) {
    const banner = document.createElement('div');
    banner.className = 'simultaneous-tree-banner';
    banner.style.left = `${startX}px`;
    banner.style.top = `${startY}px`;

    const relation = this.getRelationToRoot(simPerson, rootPerson);

    banner.innerHTML = `
      <div class="simultaneous-banner-left">
        <span class="simultaneous-banner-badge">Árbol Simultáneo</span>
        <div class="simultaneous-banner-text">
          <span class="simultaneous-banner-name">🌳 ${simPerson.nombre} ${simPerson.apellidos || ''}</span>
          <span class="simultaneous-banner-sub">${relation}</span>
        </div>
      </div>
      <div class="simultaneous-banner-actions">
        <button class="btn-simultaneous-action btn-make-primary" data-action="center" data-id="${simPerson.id}" title="Convertir a persona principal">🎯 Centrar aquí</button>
        <button class="btn-simultaneous-action btn-close-simultaneous" data-action="close-simultaneous" data-id="${simPerson.id}" title="Cerrar vista simultánea">✕ Cerrar</button>
      </div>
    `;

    banner.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      e.stopPropagation();
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (action === 'center') {
        this.setRootPerson(id);
      } else if (action === 'close-simultaneous') {
        this.toggleSimultaneousTree(id);
      }
    });

    return banner;
  }

  getRelationToRoot(person, rootPerson) {
    if (!person || !rootPerson) return 'Familiar';
    if (String(person.id) === String(rootPerson.parejaId) || String(rootPerson.id) === String(person.parejaId)) {
      return 'Cónyuge / Pareja';
    }
    if (String(person.padreId) === String(rootPerson.id) || String(person.madreId) === String(rootPerson.id)) {
      return 'Hijo/a';
    }
    if ((rootPerson.padreId && String(person.padreId) === String(rootPerson.padreId)) ||
        (rootPerson.madreId && String(person.madreId) === String(rootPerson.madreId))) {
      return 'Hermano/a';
    }
    if (String(rootPerson.padreId) === String(person.id) || String(rootPerson.madreId) === String(person.id)) {
      return person.genero === 'F' ? 'Madre' : 'Padre';
    }
    return 'Familiar';
  }

  // ==========================================
  // MODO DESCENDIENTES (HIJOS Y NIETOS)
  // ==========================================
  renderDescendantsView() {
    const cardW = this.options.cardWidth;
    const cardH = this.options.cardHeight;
    const gapX = this.options.horizontalGap + 30;
    const gapY = this.options.verticalGap;

    const rootPerson = this.peopleMap.get(this.rootPersonId);
    if (!rootPerson) return;

    let currentBaseY = 40;
    const startX = 40;

    const renderSingleDescendantTree = (person, baseY, isSimultaneous = false) => {
      const buildHierarchy = (p, depth = 0) => {
        const children = Array.from(this.peopleMap.values()).filter(c => 
          String(c.padreId) === String(p.id) || String(c.madreId) === String(p.id)
        );
        return {
          person: p,
          depth,
          children: children.map(ch => buildHierarchy(ch, depth + 1))
        };
      };

      const treeData = buildHierarchy(person, 0);

      let currentLeafY = baseY;
      const computePositions = (node) => {
        if (node.children.length === 0) {
          node.x = startX + node.depth * (cardW + gapX);
          node.y = currentLeafY;
          currentLeafY += cardH + gapY;
        } else {
          node.children.forEach(c => computePositions(c));
          node.x = startX + node.depth * (cardW + gapX);
          const firstChildY = node.children[0].y;
          const lastChildY = node.children[node.children.length - 1].y;
          node.y = (firstChildY + lastChildY) / 2;
        }
      };

      computePositions(treeData);

      const renderNode = (node) => {
        const cardEl = this.createPersonCardElement(node.person, node.x, node.y, {
          isRoot: node.depth === 0,
          isSimultaneousRoot: node.depth === 0 && isSimultaneous,
          generationName: node.depth === 0 ? 'Persona Raíz' : (node.depth === 1 ? 'Hijo/a' : 'Nieto/a (Gen ' + (node.depth + 1) + ')')
        });
        this.nodesContainer.appendChild(cardEl);

        node.children.forEach(childNode => {
          this.drawConnection(
            node.x + cardW, node.y + cardH / 2,
            childNode.x, childNode.y + cardH / 2
          );
          renderNode(childNode);
        });
      };

      renderNode(treeData);

      // Botón para añadir hijo a la persona raíz de este árbol
      if (!isSimultaneous) {
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-descendant-add';
        addBtn.innerHTML = '+ Añadir hijo/a a ' + person.nombre;
        addBtn.style.left = `${treeData.x + cardW + gapX}px`;
        addBtn.style.top = `${currentLeafY}px`;
        addBtn.onclick = () => {
          window.dispatchEvent(new CustomEvent('quick-add', { detail: { type: 'child', personId: person.id } }));
        };
        this.nodesContainer.appendChild(addBtn);
        currentLeafY += 45;
      }

      return currentLeafY;
    };

    // 1. Árbol de descendientes principal
    currentBaseY = renderSingleDescendantTree(rootPerson, currentBaseY, false) + 60;

    // 2. Árboles de descendientes simultáneos
    for (const simId of this.simultaneousRootIds) {
      const simPerson = this.peopleMap.get(simId);
      if (!simPerson) continue;

      const bannerEl = this.createSimultaneousBanner(simPerson, rootPerson, startX, currentBaseY);
      this.nodesContainer.appendChild(bannerEl);
      currentBaseY += 75;

      currentBaseY = renderSingleDescendantTree(simPerson, currentBaseY, true) + 60;
    }
  }

  // ==========================================
  // ELEMENTOS DE TARJETA Y PLACEHOLDERS
  // ==========================================
  createPersonCardElement(person, x, y, meta = {}) {
    const card = document.createElement('div');
    card.className = `person-card ${person.genero === 'F' ? 'card-female' : (person.genero === 'M' ? 'card-male' : 'card-other')}`;
    if (meta.isRoot) card.classList.add('card-root');
    if (meta.isSimultaneousRoot) card.classList.add('card-simultaneous-root');
    if (meta.isSibling) card.classList.add('card-sibling');
    if (meta.isSpouse) card.classList.add('card-spouse');
    if (meta.isCollateralDescendant) card.classList.add('card-collateral-descendant');
    const fullName = `${person.nombre} ${person.apellidos || ''}`.trim();
    card.id = `card-${person.id}`;
    card.dataset.id = String(person.id);
    card.dataset.fullname = fullName;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.width = `${this.options.cardWidth}px`;
    card.style.height = `${this.options.cardHeight}px`;

    const initials = this.getInitials(person);
    const lifeSpan = this.formatLifeSpan(person);
    const place = person.lugarNacimiento ? this.truncate(person.lugarNacimiento, 24) : '';

    const avatarHtml = person.foto 
      ? `<img src="${person.foto}" class="card-avatar-img" alt="${person.nombre}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="card-avatar-initials" style="display:none;">${initials}</div>`
      : `<div class="card-avatar-initials">${initials}</div>`;

    // Si es hermano colateral o descendiente, mostrar resumen si no está expandido
    let familySnippet = '';
    if ((meta.isSibling || meta.isCollateralDescendant) && !meta.isFamilyExpanded) {
      const spouse = person.parejaId ? this.peopleMap.get(String(person.parejaId)) : null;
      const childCount = Array.from(this.peopleMap.values()).filter(p => 
        String(p.padreId) === String(person.id) || String(p.madreId) === String(person.id)
      ).length;
      if (spouse) {
        familySnippet += `<div class="card-family-snippet" title="Cónyuge: ${spouse.nombre} ${spouse.apellidos || ''}">💍 ${spouse.nombre}</div>`;
      }
      if (childCount > 0) {
        familySnippet += `<div class="card-family-snippet" title="${childCount} hijos registrados">👶 ${childCount} ${childCount === 1 ? 'hijo' : 'hijos'}</div>`;
      }
    }

    // Botón de alternancia de hermanos en tarjetas de antepasados que tienen hermanos
    let siblingToggleHtml = '';
    if (meta.hasSiblings && meta.siblingCount > 0) {
      siblingToggleHtml = `
        <button class="card-sibling-toggle ${meta.isSiblingExpanded ? 'active' : ''}" 
                title="${meta.isSiblingExpanded ? 'Ocultar ' + meta.siblingCount + ' hermanos de ' + person.nombre : 'Mostrar ' + meta.siblingCount + ' hermanos de ' + person.nombre}" 
                data-action="toggle-siblings" 
                data-id="${person.id}">
          👥 ${meta.siblingCount}
        </button>
      `;
    }

    // Botón de alternancia de cónyuge e hijos (familia colateral)
    let familyToggleHtml = '';
    if (meta.hasFamily && meta.familyMemberCount > 0) {
      familyToggleHtml = `
        <button class="card-family-toggle ${meta.isFamilyExpanded ? 'active' : ''}" 
                title="${meta.isFamilyExpanded ? 'Contraer descendencia y cónyuge' : 'Ver cónyuge y descendencia (' + meta.familyMemberCount + ' familiares)'}" 
                data-action="toggle-sibling-family" 
                data-id="${person.id}">
          👨‍👩‍👧‍👦 ${meta.familyMemberCount}
        </button>
      `;
    }

    const badgeClass = meta.isSibling ? 'badge-sibling' : (meta.isSpouse ? 'badge-spouse' : (meta.isCollateralDescendant ? 'badge-collateral' : ''));

    card.innerHTML = `
      <div class="card-avatar-wrapper">
        ${avatarHtml}
        <span class="card-gender-icon">${person.genero === 'F' ? '♀' : (person.genero === 'M' ? '♂' : '⚪')}</span>
      </div>
      <div class="card-info">
        <div class="card-name">${fullName}</div>
        <div class="card-dates">${lifeSpan}</div>
        ${place ? `<div class="card-place" title="${person.lugarNacimiento}">📍 ${place}</div>` : ''}
        ${meta.generationName ? `<div class="card-gen-badge ${badgeClass}">${meta.generationName}</div>` : ''}
        ${familySnippet}
      </div>
      ${siblingToggleHtml}
      ${familyToggleHtml}
      <div class="card-actions">
        <button class="card-btn btn-view" title="Ver ficha completa" data-action="view" data-id="${person.id}">👁️</button>
        <button class="card-btn btn-edit" title="Editar datos" data-action="edit" data-id="${person.id}">✏️</button>
        <button class="card-btn btn-focus" title="Centrar árbol aquí" data-action="focus" data-id="${person.id}">🎯</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        const id = actionBtn.dataset.id;
        if (action === 'view') {
          window.dispatchEvent(new CustomEvent('person-select', { detail: { id } }));
        } else if (action === 'edit') {
          window.dispatchEvent(new CustomEvent('person-edit', { detail: { id } }));
        } else if (action === 'focus') {
          this.setRootPerson(id);
        } else if (action === 'toggle-siblings') {
          this.toggleSiblingExpansion(id);
        } else if (action === 'toggle-sibling-family') {
          this.toggleSiblingFamilyExpansion(id);
        }
        return;
      }
      // Clic directo en la tarjeta -> abrir detalle
      window.dispatchEvent(new CustomEvent('person-select', { detail: { id: person.id } }));
    });

    return card;
  }

  createPlaceholderCardElement(x, y, relationType, childId) {
    const card = document.createElement('div');
    card.className = `placeholder-card ${relationType === 'madre' ? 'placeholder-mother' : 'placeholder-father'}`;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.width = `${this.options.cardWidth}px`;
    card.style.height = `${this.options.cardHeight}px`;

    const label = relationType === 'padre' ? '+ Añadir Padre' : '+ Añadir Madre';
    const icon = relationType === 'padre' ? '👨' : '👩';

    card.innerHTML = `
      <div class="placeholder-icon">${icon}</div>
      <div class="placeholder-text">${label}</div>
    `;

    card.onclick = (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('quick-add', { 
        detail: { type: relationType, childId: childId } 
      }));
    };

    return card;
  }

  // ==========================================
  // CONEXIONES SVG (LÍNEAS CURVAS SUAVES)
  // ==========================================
  drawConnection(x1, y1, x2, y2) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    // Curva cúbica bezier horizontal suave
    const dx = Math.abs(x2 - x1) * 0.5;
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    path.setAttribute('d', d);
    path.setAttribute('class', 'tree-connector');
    this.svg.appendChild(path);
  }

  // ==========================================
  // UTILIDADES
  // ==========================================
  getInitials(person) {
    if (!person) return '?';
    const n = (person.nombre || '').trim()[0] || '';
    const a = (person.apellidos || '').trim()[0] || '';
    return (n + a).toUpperCase() || '?';
  }

  formatLifeSpan(person) {
    if (!person) return '';
    const birthYear = person.fechaNacimiento ? person.fechaNacimiento.split('-')[0] : '';
    const deathYear = person.fechaFallecimiento ? person.fechaFallecimiento.split('-')[0] : '';

    if (birthYear && deathYear) {
      return `${birthYear} – ${deathYear}`;
    } else if (birthYear) {
      return `n. ${birthYear}`;
    } else if (deathYear) {
      return `† ${deathYear}`;
    }
    return 'Fechas descon.';
  }

  truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen - 1) + '…' : str;
  }

  getGenerationLabel(gen, index = null) {
    if (gen === 0) return 'Persona Principal';
    if (gen === 1) return index === 0 ? 'Padre' : (index === 1 ? 'Madre' : 'Padre / Madre');
    if (gen === 2) {
      if (index === 0) return 'Abuelo Pat.';
      if (index === 1) return 'Abuela Pat.';
      if (index === 2) return 'Abuelo Mat.';
      if (index === 3) return 'Abuela Mat.';
      return 'Abuelo/a';
    }
    if (gen === 3) return 'Bisabuelo/a';
    if (gen === 4) return 'Tatarabuelo/a';
    if (gen === 5) return 'Trastatarabuelo/a';
    if (gen === 6) return 'Pentabuelo/a (6ª Gen)';
    if (gen === 7) return 'Hexabuelo/a (7ª Gen)';
    return `Gen ${gen + 1}`;
  }

  // ==========================================
  // EXPORTACIÓN A IMAGEN PNG (ALTA RESOLUCIÓN) Y PDF
  // ==========================================
  exportToPng(customTitle = null) {
    return new Promise((resolve, reject) => {
      try {
        const cards = Array.from(this.nodesContainer.querySelectorAll('.person-card, .placeholder-card'));
        if (cards.length === 0) {
          throw new Error('No hay personas visibles en el árbol para exportar');
        }

        // 1. Calcular límites exactos del contenido visible
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        cards.forEach(card => {
          const left = parseFloat(card.style.left) || 0;
          const top = parseFloat(card.style.top) || 0;
          const width = parseFloat(card.style.width) || this.options.cardWidth;
          const height = parseFloat(card.style.height) || this.options.cardHeight;
          if (left < minX) minX = left;
          if (top < minY) minY = top;
          if (left + width > maxX) maxX = left + width;
          if (top + height > maxY) maxY = top + height;
        });

        const rootPerson = this.rootPersonId ? this.peopleMap.get(this.rootPersonId) : null;
        const rootName = customTitle || (rootPerson ? `${rootPerson.nombre} ${rootPerson.apellidos || ''}`.trim() : 'Familia');

        const marginX = 60;
        const marginY = 60;
        const headerH = 100;
        const footerH = 40;

        const contentW = maxX - minX;
        const contentH = maxY - minY;
        const totalW = contentW + marginX * 2;
        const totalH = contentH + marginY * 2 + headerH + footerH;

        const canvas = document.createElement('canvas');
        // Escala 2x para calidad Retina / Ultra HD nítida en móviles
        const scale = 2;
        canvas.width = Math.round(totalW * scale);
        canvas.height = Math.round(totalH * scale);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        // Fondo suave
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, totalW, totalH);

        // Rejilla de puntos sutiles
        ctx.fillStyle = '#cbd5e1';
        for (let gx = 12; gx < totalW; gx += 24) {
          for (let gy = 12; gy < totalH; gy += 24) {
            ctx.beginPath();
            ctx.arc(gx, gy, 1.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Cabecera decorativa
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 24px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
        ctx.fillText(`🌳 Árbol Genealógico Familiar`, marginX, 48);

        ctx.fillStyle = '#475569';
        ctx.font = '500 15px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
        ctx.fillText(`Línea familiar de: ${rootName} • ${cards.length} personas visibles`, marginX, 74);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 12px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
        const dateStr = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        ctx.fillText(`Generado el ${dateStr}`, marginX, 94);

        // Línea divisoria elegante
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(marginX, 110);
        ctx.lineTo(totalW - marginX, 110);
        ctx.stroke();

        const offsetX = marginX - minX;
        const offsetY = marginY + headerH - minY;

        // 2. Dibujar todas las líneas de conexión SVG
        const svgElements = Array.from(this.svg.querySelectorAll('path, line'));
        svgElements.forEach(el => {
          ctx.save();
          ctx.translate(offsetX, offsetY);
          const isSibling = el.classList.contains('tree-connector-sibling');
          const isCouple = el.classList.contains('tree-connector-couple');
          const isMarriage = el.classList.contains('tree-connector-marriage') || el.tagName === 'line';

          if (isCouple || isMarriage) {
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([]);
          } else if (isSibling) {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([4, 3]);
          } else {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2.2;
            ctx.setLineDash([]);
          }
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          if (el.tagName === 'line') {
            const x1 = parseFloat(el.getAttribute('x1')) || 0;
            const y1 = parseFloat(el.getAttribute('y1')) || 0;
            const x2 = parseFloat(el.getAttribute('x2')) || 0;
            const y2 = parseFloat(el.getAttribute('y2')) || 0;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          } else if (el.tagName === 'path') {
            const d = el.getAttribute('d');
            if (d && typeof Path2D !== 'undefined') {
              const path2d = new Path2D(d);
              ctx.stroke(path2d);
            }
          }
          ctx.restore();
        });

        // 3. Dibujar insignias de matrimonio entre cónyuges
        const badges = Array.from(this.nodesContainer.querySelectorAll('.couple-marriage-badge'));
        badges.forEach(b => {
          const bx = parseFloat(b.style.left) || 0;
          const by = parseFloat(b.style.top) || 0;
          ctx.save();
          ctx.translate(bx + offsetX, by + offsetY);
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#fcd34d';
          ctx.lineWidth = 1;
          this.drawCanvasRoundedRect(ctx, 0, 0, 84, 18, 9, true, true);
          ctx.fillStyle = '#b45309';
          ctx.font = 'bold 9.5px "Plus Jakarta Sans", system-ui, sans-serif';
          ctx.fillText('💍 Matrimonio', 7, 12.5);
          ctx.restore();
        });

        // 4. Dibujar cada tarjeta
        cards.forEach(card => {
          const cx = (parseFloat(card.style.left) || 0) + offsetX;
          const cy = (parseFloat(card.style.top) || 0) + offsetY;
          const cw = parseFloat(card.style.width) || this.options.cardWidth;
          const ch = parseFloat(card.style.height) || this.options.cardHeight;

          if (card.classList.contains('placeholder-card')) {
            ctx.save();
            ctx.fillStyle = '#f8fafc';
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            this.drawCanvasRoundedRect(ctx, cx, cy, cw, ch, 8, true, true);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '500 12px "Plus Jakarta Sans", system-ui, sans-serif';
            const txt = card.textContent.trim().replace(/\s+/g, ' ');
            ctx.fillText(txt, cx + 24, cy + ch / 2 + 4);
            ctx.restore();
            return;
          }

          const personId = card.dataset.id;
          const person = this.peopleMap.get(String(personId));
          if (!person) return;

          const isFemale = person.genero === 'F';
          const isMale = person.genero === 'M';
          const isRoot = card.classList.contains('card-root');

          ctx.save();
          // Sombra suave de la tarjeta
          ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 2;

          // Fondo de la tarjeta
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = isRoot ? '#0284c7' : (isFemale ? '#f472b6' : (isMale ? '#60a5fa' : '#cbd5e1'));
          ctx.lineWidth = isRoot ? 2.5 : 1.5;
          this.drawCanvasRoundedRect(ctx, cx, cy, cw, ch, 10, true, true);
          ctx.restore();

          // Barra vertical de acento de género en el borde izquierdo
          ctx.save();
          ctx.fillStyle = isFemale ? '#ec4899' : (isMale ? '#2563eb' : '#94a3b8');
          this.drawCanvasRoundedRect(ctx, cx, cy, 5, ch, { tl: 10, bl: 10, tr: 0, br: 0 }, true, false);
          ctx.restore();

          // Círculo de Avatar
          const avatarX = cx + 28;
          const avatarY = cy + ch / 2;
          const avatarR = 20;

          ctx.save();
          ctx.fillStyle = isFemale ? '#fce7f3' : (isMale ? '#dbeafe' : '#f1f5f9');
          ctx.beginPath();
          ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
          ctx.fill();

          // Iniciales en el avatar
          ctx.fillStyle = isFemale ? '#db2777' : (isMale ? '#1d4ed8' : '#475569');
          ctx.font = 'bold 12px "Plus Jakarta Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(this.getInitials(person), avatarX, avatarY);
          ctx.restore();

          // Textos biográficos
          const textX = cx + 56;
          const maxTextW = cw - 64;

          // Nombre completo
          ctx.save();
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 12.5px "Plus Jakarta Sans", system-ui, sans-serif';
          const fullName = `${person.nombre} ${person.apellidos || ''}`.trim();
          const displayName = this.truncateCanvasText(ctx, fullName, maxTextW);
          ctx.fillText(displayName, textX, cy + 26);

          // Fechas de vida
          ctx.fillStyle = '#64748b';
          ctx.font = '400 11px "Plus Jakarta Sans", system-ui, sans-serif';
          const lifeSpan = this.formatLifeSpan(person);
          ctx.fillText(lifeSpan, textX, cy + 44);

          // Lugar o badge
          const place = person.lugarNacimiento || person.lugarFallecimiento;
          if (place) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '400 10px "Plus Jakarta Sans", system-ui, sans-serif';
            const displayPlace = this.truncateCanvasText(ctx, `📍 ${place}`, maxTextW);
            ctx.fillText(displayPlace, textX, cy + 60);
          }

          // Badge de parentesco
          const badgeEl = card.querySelector('.card-gen-badge');
          if (badgeEl) {
            const badgeText = badgeEl.textContent.trim();
            ctx.fillStyle = isFemale ? '#fdf2f8' : (isMale ? '#eff6ff' : '#f8fafc');
            ctx.strokeStyle = isFemale ? '#fbcfe8' : (isMale ? '#bfdbfe' : '#e2e8f0');
            ctx.lineWidth = 1;
            const bW = Math.min(ctx.measureText(badgeText).width + 12, maxTextW);
            this.drawCanvasRoundedRect(ctx, textX, cy + (place ? 66 : 54), bW, 16, 4, true, true);
            ctx.fillStyle = isFemale ? '#be185d' : (isMale ? '#1d4ed8' : '#475569');
            ctx.font = '600 9.5px "Plus Jakarta Sans", system-ui, sans-serif';
            ctx.fillText(badgeText, textX + 6, cy + (place ? 78 : 66));
          }

          ctx.restore();
        });

        // 5. Pie de imagen
        ctx.save();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 11px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText('Mi Árbol Genealógico Familiar • Documento exportado en alta resolución', marginX, totalH - 18);
        ctx.restore();

        // 6. Descargar automáticamente el archivo PNG
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('No se pudo generar el archivo PNG'));
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const safeTitle = rootName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
          const today = new Date().toISOString().split('T')[0];
          a.download = `arbol_genealogico_${safeTitle}_${today}.png`;
          a.href = url;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve(a.download);
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    });
  }

  drawCanvasRoundedRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof radius === 'number') {
      radius = { tl: radius, tr: radius, br: radius, bl: radius };
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  truncateCanvasText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
      t = t.substring(0, t.length - 1);
    }
    return t + '…';
  }

  printTree() {
    window.print();
  }
}
