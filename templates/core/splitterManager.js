// --- core/splitterManager.js ---
Core.SplitterManager = (function() {
    let splitter, panel, mainContent, toggleTab;
    let isResizing = false;
    const collapseThreshold = 50;

    function init() {
        splitter = document.getElementById('panel-splitter');
        panel = document.getElementById('controls-panel');
        mainContent = document.getElementById('main-content');
        toggleTab = document.getElementById('panel-toggle-tab');

        splitter.addEventListener('mousedown', startResize);
        splitter.addEventListener('touchstart', startResize, { passive: false });
    }

    function startResize(e) {
        isResizing = true;
        document.body.classList.add('resizing');
        
        window.addEventListener('mousemove', handleResize);
        window.addEventListener('mouseup', stopResize);
        
        window.addEventListener('touchmove', handleResize);
        window.addEventListener('touchend', stopResize);

        e.preventDefault();
    }

    function handleResize(e) {
        if (!isResizing) return;
        
        const isVertical = window.innerWidth <= 768;
        const rect = mainContent.getBoundingClientRect();
        
        if (isVertical) { // Vertical resizing
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const newHeight = rect.bottom - clientY;
            if (newHeight < collapseThreshold) {
                panel.classList.add('collapsed');
                stopResize();
            } else {
                panel.classList.remove('collapsed');
                panel.style.height = newHeight + 'px';
                toggleTab.style.bottom = (newHeight + splitter.clientHeight) + 'px';
            }
        } else { // Horizontal resizing
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const newWidth = rect.right - clientX;
            if (newWidth < collapseThreshold) {
                panel.classList.add('collapsed');
                stopResize();
            } else {
                panel.classList.remove('collapsed');
                panel.style.width = newWidth + 'px';
                toggleTab.style.right = (newWidth + splitter.clientWidth) + 'px';
            }
        }
    }

    function stopResize() {
        isResizing = false;
        document.body.classList.remove('resizing');
        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', stopResize);
        window.removeEventListener('touchmove', handleResize);
        window.removeEventListener('touchend', stopResize);
    }
    
    return { init };
})();