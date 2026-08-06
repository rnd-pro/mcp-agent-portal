export const DEFAULT_LOCALE = 'en';

export const SUPPORTED_LOCALES = Object.freeze(['en', 'ru', 'es']);
export const DEFAULT_LOCALE_MODE = 'auto';
export const SUPPORTED_LOCALE_MODES = Object.freeze([
  DEFAULT_LOCALE_MODE,
  ...SUPPORTED_LOCALES,
]);

export const LOCALE_LABELS = Object.freeze({
  en: 'English',
  ru: 'Русский',
  es: 'Español',
});

const EN_MESSAGES = Object.freeze({
  'codeBlock.copy': 'Copy',
  'codeBlock.copied': 'Copied',
  'codeBlock.copyFailed': 'Copy failed',
  'dialog.cancel': 'Cancel',
  'dialog.confirm': 'Confirm',
  'dialog.ok': 'OK',
  'networkApproval.title': 'Network approval',
  'networkApproval.heading': 'Waiting for local approval',
  'networkApproval.message': 'This network browser must be approved from an already authorized local browser.',
  'networkApproval.requestLabel': 'Request',
  'networkApproval.addressLabel': 'Address',
  'networkApproval.waitingStatus': 'Waiting...',
  'networkApproval.approvedStatus': 'Approved. Opening...',
  'networkApproval.rejectedStatus': 'Rejected from the local browser.',
  'quickOpen.placeholder': 'Search files...',
  'quickOpen.empty': 'No files found',
  'chat.composer.placeholder': 'Ask anything',
  'chat.list.title': 'Chats',
  'chat.list.new': 'New',
  'chat.list.empty': 'No chats yet.',
  'chat.list.filter.all': 'All',
  'chat.list.filter.project': 'By Project',
  'chat.list.filter.active': 'Active',
  'chat.sidebar.new': 'New chat',
  'chat.sidebar.title': 'Chats',
  'chat.sidebar.delete': 'Delete',
  'chat.sidebar.deleteChat': 'Delete chat',
  'chat.sidebar.toggleChildren': 'Toggle child chats',
  'chat.message.input': 'Input',
  'chat.message.result': 'Result',
  'chat.message.running': 'Running...',
  'chat.message.queued': 'Queued',
  'chat.message.item': 'Item',
  'chat.message.completed': 'Completed',
  'chat.message.failed': 'Failed',
  'chat.message.cancelled': 'Cancelled',
  'chat.message.status': 'Status',
  'chat.message.source': 'Source',
  'chat.message.attachment': 'Attachment',
  'chat.message.artifact': 'Artifact',
  'chat.message.download': 'View/Download',
  'chat.message.approvalTitle': 'Approval required',
  'chat.message.approvalText': 'Approval is requested for this operation.',
  'chat.message.approve': 'Approve',
  'chat.message.reject': 'Reject',
  'chat.message.actionRequired': 'Action required',
  'chat.message.retry': 'Retry',
  'chat.message.confirmTitle': 'Confirmation required',
  'chat.message.confirmText': 'Confirm this change?',
  'chat.message.confirm': 'Confirm',
  'chat.message.cancel': 'Cancel',
  'chat.message.operationCancelled': 'Operation cancelled',
  'chat.message.error': 'Error',
  'chat.message.copyResponse': 'Copy response',
  'chat.message.thinking': 'Thinking',
  'chat.message.worked': 'Worked',
  'chat.message.workedFor': 'Worked for {elapsed}',
  'chat.message.thinkingFor': 'Thinking for {elapsed}',
  'chat.message.processing': 'Processing...',
  'chat.message.thinkingStatus': 'Thinking...',
  'chat.message.runningTool': 'Running: {tool}',
  'chat.message.writingResponse': 'Writing response...',
  'chat.meta.tokens': 'Tokens',
  'chat.meta.cost': 'Cost',
  'chat.meta.exit': 'exit {code}',
  'chat.meta.toolCall': '{count} tool call',
  'chat.meta.toolCalls': '{count} tool calls',
  'toolbar.duplicate': 'Duplicate',
  'toolbar.mute': 'Mute',
  'toolbar.delete': 'Delete',
  'toolbar.enterSubgraph': 'Enter Subgraph',
  'toolbar.exploreConnections': 'Explore connections',
  'toolbar.viewCode': 'View Code',
  'inspector.empty': 'Select a node',
  'inspector.label': 'Label',
  'inspector.type': 'Type',
  'inspector.category': 'Category',
  'inspector.inputs': 'Inputs',
  'inspector.outputs': 'Outputs',
  'inspector.controls': 'Controls',
  'inspector.fire': 'Fire',
  'inspector.subgraph': 'Subgraph',
  'inspector.innerNodes': 'Inner Nodes',
  'inspector.enterSubgraph': 'Enter Subgraph',
  'templatePreview.placeholders': 'Placeholders',
  'templatePreview.empty': 'Type {field} in template to add placeholders',
  'templatePreview.testData': 'Test Data (JSON)',
  'templatePreview.preview': 'Preview',
  'context.deleteNode': 'Delete Node',
  'context.cloneNode': 'Clone Node',
  'context.selectAll': 'Select All',
  'context.deleteConnection': 'Delete Connection',
  'context.addNode': 'Add Node',
  'context.addComment': 'Add Comment',
  'context.addFrame': 'Add Frame',
  'context.paste': 'Paste',
  'context.fitView': 'Fit View',
  'context.autoLayout': 'Auto Layout',
  'nodeCanvas.addNode': 'Add Node',
  'nodeCanvas.toggleMinimap': 'Toggle minimap',
  'nodeSearch.placeholder': 'Search nodes...',
  'palette.title': 'Components',
  'palette.searchPlaceholder': 'Search components...',
  'palette.searchLabel': 'Search components',
  'palette.resultsLabel': 'Component results',
  'palette.toggleCategory': 'Toggle category',
  'tree.loading': 'Loading...',
  'tree.filterPlaceholder': 'Filter...',
  'tree.collapseAll': 'Collapse all',
  'loading.label': 'Loading',
  'loading.initializing': 'Initializing...',
  'eventFeed.title': 'Events',
  'eventFeed.empty': 'No events',
  'outputGraph.title': 'Graph',
  'outputGraph.empty': 'No graph data',
  'outputGraph.truncated': 'Preview truncated',
  'layout.collapse': 'Collapse',
  'layout.fullscreen': 'Fullscreen',
  'layout.resetAll': 'Reset all layouts to default',
  'tabs.close': 'Close',
  'tabs.new': 'New tab',
  'tabs.home': 'Home',
  'tabs.openProject': 'Open project',
  'sourceViewer.showInGraph': 'Show in Graph',
  'sourceViewer.toggleViewMode': 'Toggle view mode',
  'sourceViewer.graphLabel': 'graph',
  'notification.title': 'Notifications',
  'notification.empty': 'No notifications',
  'notification.muteNarration': 'Mute narration',
  'notification.unmuteNarration': 'Unmute narration',
  'notification.depth.terse': 'Brief',
  'notification.depth.chatty': 'Detailed',
  'notification.event.taskCreated': 'Task created',
  'notification.event.taskMoved': 'Task moved',
  'notification.event.taskStarted': 'Task started',
  'notification.event.taskCompleted': 'Task completed',
  'notification.event.taskFailed': 'Task failed',
  'notification.event.taskBlocked': 'Task blocked',
  'notification.event.approvalRequired': 'Approval required',
  'notification.event.agentMessage': 'Agent message',
  'notification.event.generic': 'Other',
  'notification.widget.trigger': 'Notifications',
  'notification.widget.master': 'Notifications on',
  'notification.widget.soundVolume': 'Sound volume',
  'notification.widget.voiceVolume': 'Voice volume',
  'notification.widget.narration': 'Voice narration',
  'notification.widget.openFull': 'Open notification settings',
  'notification.widget.reset': 'Reset to defaults',
  'notification.detailed.title': 'Notification settings',
  'notification.editor.preview': 'Preview',
  'notification.editor.sampleTitle': 'Sample task',
  'notification.sound.section': 'Generative sound',
  'notification.sound.waveform': 'Waveform',
  'notification.sound.pitch': 'Pitch',
  'notification.sound.duration': 'Length',
  'notification.sound.hint': 'Shapes every generative tone.',
  'notification.sound.wave.auto': 'Auto (per event)',
  'notification.sound.wave.sine': 'Sine',
  'notification.sound.wave.triangle': 'Triangle',
  'notification.sound.wave.square': 'Square',
  'notification.sound.wave.sawtooth': 'Sawtooth',
  'notification.detailed.soundSection': 'Sounds per event',
  'notification.detailed.stageSection': 'Narration per board stage',
  'notification.detailed.phraseSection': 'Spoken phrase bank',
  'notification.detailed.depth': 'Narration depth',
  'notification.detailed.phraseHint': 'One phrase per line. {title} and {stage} are filled in.',
  'notification.detailed.phraseReset': 'Reset phrases',
  'notification.stage.intake': 'Intake',
  'notification.stage.decompose': 'Decompose',
  'notification.stage.orchestrate': 'Orchestrate',
  'notification.stage.execute': 'Execute',
  'notification.stage.audit': 'Audit',
  'notification.stage.terminal': 'Terminal',
});

const RU_MESSAGES = Object.freeze({
  'codeBlock.copy': 'Копировать',
  'codeBlock.copied': 'Скопировано',
  'codeBlock.copyFailed': 'Ошибка копирования',
  'dialog.cancel': 'Отмена',
  'dialog.confirm': 'Подтвердить',
  'dialog.ok': 'OK',
  'networkApproval.title': 'Подтверждение сети',
  'networkApproval.heading': 'Ожидание локального подтверждения',
  'networkApproval.message': 'Этот сетевой браузер нужно подтвердить из уже авторизованного локального браузера.',
  'networkApproval.requestLabel': 'Запрос',
  'networkApproval.addressLabel': 'Адрес',
  'networkApproval.waitingStatus': 'Ожидание...',
  'networkApproval.approvedStatus': 'Подтверждено. Открываем...',
  'networkApproval.rejectedStatus': 'Отклонено из локального браузера.',
  'quickOpen.placeholder': 'Поиск файлов...',
  'quickOpen.empty': 'Файлы не найдены',
  'chat.composer.placeholder': 'Спросите что-нибудь',
  'chat.list.title': 'Чаты',
  'chat.list.new': 'Новый',
  'chat.list.empty': 'Чатов пока нет.',
  'chat.list.filter.all': 'Все',
  'chat.list.filter.project': 'По проекту',
  'chat.list.filter.active': 'Активные',
  'chat.sidebar.new': 'Новый чат',
  'chat.sidebar.title': 'Чаты',
  'chat.sidebar.delete': 'Удалить',
  'chat.sidebar.deleteChat': 'Удалить чат',
  'chat.sidebar.toggleChildren': 'Показать дочерние чаты',
  'chat.message.input': 'Ввод',
  'chat.message.result': 'Результат',
  'chat.message.running': 'Выполняется...',
  'chat.message.queued': 'В очереди',
  'chat.message.item': 'Элемент',
  'chat.message.completed': 'Завершено',
  'chat.message.failed': 'Ошибка',
  'chat.message.cancelled': 'Отменено',
  'chat.message.status': 'Статус',
  'chat.message.source': 'Источник',
  'chat.message.attachment': 'Вложение',
  'chat.message.artifact': 'Артефакт',
  'chat.message.download': 'Открыть/скачать',
  'chat.message.approvalTitle': 'Требуется подтверждение',
  'chat.message.approvalText': 'Для этой операции запрошено подтверждение.',
  'chat.message.approve': 'Подтвердить',
  'chat.message.reject': 'Отклонить',
  'chat.message.actionRequired': 'Требуется действие',
  'chat.message.retry': 'Повторить',
  'chat.message.confirmTitle': 'Требуется подтверждение',
  'chat.message.confirmText': 'Подтвердить это изменение?',
  'chat.message.confirm': 'Подтвердить',
  'chat.message.cancel': 'Отмена',
  'chat.message.operationCancelled': 'Операция отменена',
  'chat.message.error': 'Ошибка',
  'chat.message.copyResponse': 'Скопировать ответ',
  'chat.message.thinking': 'Думает',
  'chat.message.worked': 'Работал',
  'chat.message.workedFor': 'Работал {elapsed}',
  'chat.message.thinkingFor': 'Думает {elapsed}',
  'chat.message.processing': 'Выполняется...',
  'chat.message.thinkingStatus': 'Думает...',
  'chat.message.runningTool': 'Инструмент: {tool}',
  'chat.message.writingResponse': 'Пишет ответ...',
  'chat.meta.tokens': 'Токены',
  'chat.meta.cost': 'Стоимость',
  'chat.meta.exit': 'код выхода {code}',
  'chat.meta.toolCall': '{count} вызов инструмента',
  'chat.meta.toolCalls': '{count} вызовов инструмента',
  'toolbar.duplicate': 'Дублировать',
  'toolbar.mute': 'Отключить',
  'toolbar.delete': 'Удалить',
  'toolbar.enterSubgraph': 'Открыть подграф',
  'toolbar.exploreConnections': 'Показать связи',
  'toolbar.viewCode': 'Показать код',
  'inspector.empty': 'Выберите узел',
  'inspector.label': 'Название',
  'inspector.type': 'Тип',
  'inspector.category': 'Категория',
  'inspector.inputs': 'Входы',
  'inspector.outputs': 'Выходы',
  'inspector.controls': 'Элементы управления',
  'inspector.fire': 'Запустить',
  'inspector.subgraph': 'Подграф',
  'inspector.innerNodes': 'Внутренние узлы',
  'inspector.enterSubgraph': 'Открыть подграф',
  'templatePreview.placeholders': 'Плейсхолдеры',
  'templatePreview.empty': 'Введите {field} в шаблоне, чтобы добавить плейсхолдеры',
  'templatePreview.testData': 'Тестовые данные (JSON)',
  'templatePreview.preview': 'Предпросмотр',
  'context.deleteNode': 'Удалить узел',
  'context.cloneNode': 'Клонировать узел',
  'context.selectAll': 'Выбрать все',
  'context.deleteConnection': 'Удалить связь',
  'context.addNode': 'Добавить узел',
  'context.addComment': 'Добавить комментарий',
  'context.addFrame': 'Добавить фрейм',
  'context.paste': 'Вставить',
  'context.fitView': 'Вписать вид',
  'context.autoLayout': 'Автораскладка',
  'nodeCanvas.addNode': 'Добавить узел',
  'nodeCanvas.toggleMinimap': 'Переключить миникарту',
  'nodeSearch.placeholder': 'Поиск узлов...',
  'palette.title': 'Компоненты',
  'palette.searchPlaceholder': 'Поиск компонентов...',
  'palette.searchLabel': 'Поиск компонентов',
  'palette.resultsLabel': 'Результаты компонентов',
  'palette.toggleCategory': 'Свернуть категорию',
  'tree.loading': 'Загрузка...',
  'tree.filterPlaceholder': 'Фильтр...',
  'tree.collapseAll': 'Свернуть все',
  'loading.label': 'Загрузка',
  'loading.initializing': 'Инициализация...',
  'eventFeed.title': 'События',
  'eventFeed.empty': 'Событий нет',
  'outputGraph.title': 'Граф',
  'outputGraph.empty': 'Нет данных графа',
  'outputGraph.truncated': 'Предпросмотр обрезан',
  'layout.collapse': 'Свернуть',
  'layout.fullscreen': 'Во весь экран',
  'layout.resetAll': 'Сбросить все раскладки',
  'tabs.close': 'Закрыть',
  'tabs.new': 'Новая вкладка',
  'tabs.home': 'Главная',
  'tabs.openProject': 'Открыть проект',
  'sourceViewer.showInGraph': 'Показать в графе',
  'sourceViewer.toggleViewMode': 'Переключить режим просмотра',
  'sourceViewer.graphLabel': 'граф',
  'notification.title': 'Уведомления',
  'notification.empty': 'Нет уведомлений',
  'notification.muteNarration': 'Отключить озвучку',
  'notification.unmuteNarration': 'Включить озвучку',
  'notification.depth.terse': 'Кратко',
  'notification.depth.chatty': 'Подробно',
  'notification.event.taskCreated': 'Задача создана',
  'notification.event.taskMoved': 'Задача перемещена',
  'notification.event.taskStarted': 'Задача запущена',
  'notification.event.taskCompleted': 'Задача завершена',
  'notification.event.taskFailed': 'Задача провалена',
  'notification.event.taskBlocked': 'Задача заблокирована',
  'notification.event.approvalRequired': 'Требуется подтверждение',
  'notification.event.agentMessage': 'Сообщение агента',
  'notification.event.generic': 'Другое',
  'notification.widget.trigger': 'Уведомления',
  'notification.widget.master': 'Уведомления включены',
  'notification.widget.soundVolume': 'Громкость сигналов',
  'notification.widget.voiceVolume': 'Громкость голоса',
  'notification.widget.narration': 'Голосовая озвучка',
  'notification.widget.openFull': 'Открыть настройки уведомлений',
  'notification.widget.reset': 'Сбросить по умолчанию',
  'notification.detailed.title': 'Настройки уведомлений',
  'notification.editor.preview': 'Прослушать',
  'notification.editor.sampleTitle': 'Демо-задача',
  'notification.sound.section': 'Генеративный звук',
  'notification.sound.waveform': 'Волна',
  'notification.sound.pitch': 'Высота',
  'notification.sound.duration': 'Длительность',
  'notification.sound.hint': 'Влияет на все генеративные сигналы.',
  'notification.sound.wave.auto': 'Авто (по событию)',
  'notification.sound.wave.sine': 'Синус',
  'notification.sound.wave.triangle': 'Треугольник',
  'notification.sound.wave.square': 'Квадрат',
  'notification.sound.wave.sawtooth': 'Пила',
  'notification.detailed.soundSection': 'Звуки по событиям',
  'notification.detailed.stageSection': 'Озвучка по этапам доски',
  'notification.detailed.phraseSection': 'Банк произносимых фраз',
  'notification.detailed.depth': 'Подробность озвучки',
  'notification.detailed.phraseHint': 'Одна фраза в строке. {title} и {stage} подставляются.',
  'notification.detailed.phraseReset': 'Сбросить фразы',
  'notification.stage.intake': 'Приём',
  'notification.stage.decompose': 'Декомпозиция',
  'notification.stage.orchestrate': 'Оркестрация',
  'notification.stage.execute': 'Выполнение',
  'notification.stage.audit': 'Аудит',
  'notification.stage.terminal': 'Терминал',
});

const ES_MESSAGES = Object.freeze({
  'codeBlock.copy': 'Copiar',
  'codeBlock.copied': 'Copiado',
  'codeBlock.copyFailed': 'Error al copiar',
  'dialog.cancel': 'Cancelar',
  'dialog.confirm': 'Confirmar',
  'dialog.ok': 'OK',
  'networkApproval.title': 'Aprobación de red',
  'networkApproval.heading': 'Esperando aprobación local',
  'networkApproval.message': 'Este navegador de red debe aprobarse desde un navegador local ya autorizado.',
  'networkApproval.requestLabel': 'Solicitud',
  'networkApproval.addressLabel': 'Dirección',
  'networkApproval.waitingStatus': 'Esperando...',
  'networkApproval.approvedStatus': 'Aprobado. Abriendo...',
  'networkApproval.rejectedStatus': 'Rechazado desde el navegador local.',
  'quickOpen.placeholder': 'Buscar archivos...',
  'quickOpen.empty': 'No se encontraron archivos',
  'chat.composer.placeholder': 'Pregunta lo que quieras',
  'chat.list.title': 'Chats',
  'chat.list.new': 'Nuevo',
  'chat.list.empty': 'Aún no hay chats.',
  'chat.list.filter.all': 'Todos',
  'chat.list.filter.project': 'Por proyecto',
  'chat.list.filter.active': 'Activos',
  'chat.sidebar.new': 'Nuevo chat',
  'chat.sidebar.title': 'Chats',
  'chat.sidebar.delete': 'Eliminar',
  'chat.sidebar.deleteChat': 'Eliminar chat',
  'chat.sidebar.toggleChildren': 'Alternar chats secundarios',
  'chat.message.input': 'Entrada',
  'chat.message.result': 'Resultado',
  'chat.message.running': 'Ejecutando...',
  'chat.message.queued': 'En cola',
  'chat.message.item': 'Elemento',
  'chat.message.completed': 'Completado',
  'chat.message.failed': 'Falló',
  'chat.message.cancelled': 'Cancelado',
  'chat.message.status': 'Estado',
  'chat.message.source': 'Fuente',
  'chat.message.attachment': 'Adjunto',
  'chat.message.artifact': 'Artefacto',
  'chat.message.download': 'Ver/descargar',
  'chat.message.approvalTitle': 'Aprobación requerida',
  'chat.message.approvalText': 'Se solicita aprobación para esta operación.',
  'chat.message.approve': 'Aprobar',
  'chat.message.reject': 'Rechazar',
  'chat.message.actionRequired': 'Acción requerida',
  'chat.message.retry': 'Reintentar',
  'chat.message.confirmTitle': 'Confirmación requerida',
  'chat.message.confirmText': '¿Confirmar este cambio?',
  'chat.message.confirm': 'Confirmar',
  'chat.message.cancel': 'Cancelar',
  'chat.message.operationCancelled': 'Operación cancelada',
  'chat.message.error': 'Error',
  'chat.message.copyResponse': 'Copiar respuesta',
  'chat.message.thinking': 'Pensando',
  'chat.message.worked': 'Trabajó',
  'chat.message.workedFor': 'Trabajó durante {elapsed}',
  'chat.message.thinkingFor': 'Pensando durante {elapsed}',
  'chat.message.processing': 'Procesando...',
  'chat.message.thinkingStatus': 'Pensando...',
  'chat.message.runningTool': 'Ejecutando: {tool}',
  'chat.message.writingResponse': 'Escribiendo respuesta...',
  'chat.meta.tokens': 'Tokens',
  'chat.meta.cost': 'Costo',
  'chat.meta.exit': 'salida {code}',
  'chat.meta.toolCall': '{count} llamada de herramienta',
  'chat.meta.toolCalls': '{count} llamadas de herramienta',
  'toolbar.duplicate': 'Duplicar',
  'toolbar.mute': 'Silenciar',
  'toolbar.delete': 'Eliminar',
  'toolbar.enterSubgraph': 'Entrar al subgrafo',
  'toolbar.exploreConnections': 'Explorar conexiones',
  'toolbar.viewCode': 'Ver código',
  'inspector.empty': 'Selecciona un nodo',
  'inspector.label': 'Etiqueta',
  'inspector.type': 'Tipo',
  'inspector.category': 'Categoría',
  'inspector.inputs': 'Entradas',
  'inspector.outputs': 'Salidas',
  'inspector.controls': 'Controles',
  'inspector.fire': 'Ejecutar',
  'inspector.subgraph': 'Subgrafo',
  'inspector.innerNodes': 'Nodos internos',
  'inspector.enterSubgraph': 'Entrar al subgrafo',
  'templatePreview.placeholders': 'Marcadores',
  'templatePreview.empty': 'Escribe {field} en la plantilla para agregar marcadores',
  'templatePreview.testData': 'Datos de prueba (JSON)',
  'templatePreview.preview': 'Vista previa',
  'context.deleteNode': 'Eliminar nodo',
  'context.cloneNode': 'Clonar nodo',
  'context.selectAll': 'Seleccionar todo',
  'context.deleteConnection': 'Eliminar conexión',
  'context.addNode': 'Agregar nodo',
  'context.addComment': 'Agregar comentario',
  'context.addFrame': 'Agregar marco',
  'context.paste': 'Pegar',
  'context.fitView': 'Ajustar vista',
  'context.autoLayout': 'Diseño automático',
  'nodeCanvas.addNode': 'Agregar nodo',
  'nodeCanvas.toggleMinimap': 'Alternar minimapa',
  'nodeSearch.placeholder': 'Buscar nodos...',
  'palette.title': 'Componentes',
  'palette.searchPlaceholder': 'Buscar componentes...',
  'palette.searchLabel': 'Buscar componentes',
  'palette.resultsLabel': 'Resultados de componentes',
  'palette.toggleCategory': 'Alternar categoría',
  'tree.loading': 'Cargando...',
  'tree.filterPlaceholder': 'Filtrar...',
  'tree.collapseAll': 'Contraer todo',
  'loading.label': 'Cargando',
  'loading.initializing': 'Inicializando...',
  'eventFeed.title': 'Eventos',
  'eventFeed.empty': 'No hay eventos',
  'outputGraph.title': 'Grafo',
  'outputGraph.empty': 'No hay datos de grafo',
  'outputGraph.truncated': 'Vista previa truncada',
  'layout.collapse': 'Contraer',
  'layout.fullscreen': 'Pantalla completa',
  'layout.resetAll': 'Restablecer todos los diseños',
  'tabs.close': 'Cerrar',
  'tabs.new': 'Nueva pestaña',
  'tabs.home': 'Inicio',
  'tabs.openProject': 'Abrir proyecto',
  'sourceViewer.showInGraph': 'Mostrar en grafo',
  'sourceViewer.toggleViewMode': 'Alternar modo de vista',
  'sourceViewer.graphLabel': 'grafo',
  'notification.title': 'Notificaciones',
  'notification.empty': 'Sin notificaciones',
  'notification.muteNarration': 'Silenciar narración',
  'notification.unmuteNarration': 'Activar narración',
  'notification.depth.terse': 'Breve',
  'notification.depth.chatty': 'Detallado',
  'notification.event.taskCreated': 'Tarea creada',
  'notification.event.taskMoved': 'Tarea movida',
  'notification.event.taskStarted': 'Tarea iniciada',
  'notification.event.taskCompleted': 'Tarea completada',
  'notification.event.taskFailed': 'Tarea fallida',
  'notification.event.taskBlocked': 'Tarea bloqueada',
  'notification.event.approvalRequired': 'Aprobación requerida',
  'notification.event.agentMessage': 'Mensaje del agente',
  'notification.event.generic': 'Otro',
  'notification.widget.trigger': 'Notificaciones',
  'notification.widget.master': 'Notificaciones activadas',
  'notification.widget.soundVolume': 'Volumen de sonido',
  'notification.widget.voiceVolume': 'Volumen de voz',
  'notification.widget.narration': 'Narración por voz',
  'notification.widget.openFull': 'Abrir ajustes de notificaciones',
  'notification.widget.reset': 'Restablecer valores',
  'notification.detailed.title': 'Ajustes de notificaciones',
  'notification.editor.preview': 'Escuchar',
  'notification.editor.sampleTitle': 'Tarea de ejemplo',
  'notification.sound.section': 'Sonido generativo',
  'notification.sound.waveform': 'Forma de onda',
  'notification.sound.pitch': 'Tono',
  'notification.sound.duration': 'Duración',
  'notification.sound.hint': 'Afecta a todos los tonos generativos.',
  'notification.sound.wave.auto': 'Auto (por evento)',
  'notification.sound.wave.sine': 'Senoidal',
  'notification.sound.wave.triangle': 'Triangular',
  'notification.sound.wave.square': 'Cuadrada',
  'notification.sound.wave.sawtooth': 'Diente de sierra',
  'notification.detailed.soundSection': 'Sonidos por evento',
  'notification.detailed.stageSection': 'Narración por etapa del tablero',
  'notification.detailed.phraseSection': 'Banco de frases habladas',
  'notification.detailed.depth': 'Nivel de narración',
  'notification.detailed.phraseHint': 'Una frase por línea. {title} y {stage} se completan.',
  'notification.detailed.phraseReset': 'Restablecer frases',
  'notification.stage.intake': 'Entrada',
  'notification.stage.decompose': 'Descomponer',
  'notification.stage.orchestrate': 'Orquestar',
  'notification.stage.execute': 'Ejecutar',
  'notification.stage.audit': 'Auditoría',
  'notification.stage.terminal': 'Terminal',
});

export const LOCALE_CATALOGS = Object.freeze({
  en: EN_MESSAGES,
  ru: RU_MESSAGES,
  es: ES_MESSAGES,
});

export const LOCALE_CATALOG_KEYS = Object.freeze(Object.keys(EN_MESSAGES).sort());

let configuredLocale = DEFAULT_LOCALE;
let configuredLocaleMode = DEFAULT_LOCALE_MODE;
let configuredMessages = {};
let explicitlyConfiguredLocale = false;
let configuredPreferences = [];

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMessages(messages = {}) {
  if (!isPlainObject(messages)) return {};
  let result = {};
  for (let [key, value] of Object.entries(messages)) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

function normalizeLocaleMessages(messages = {}) {
  if (!isPlainObject(messages)) return {};
  let result = {};
  for (let [key, value] of Object.entries(messages)) {
    let locale = normalizeLocale(key, { fallback: '' });
    if (!locale) continue;
    result[locale] = {
      ...(result[locale] || {}),
      ...normalizeMessages(value),
    };
  }
  return result;
}

function normalizeLocalePreferences(preferences = []) {
  let values = Array.isArray(preferences) ? preferences : [preferences];
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

export function getNavigatorLocalePreferences(source = globalThis.navigator) {
  if (!source) return [DEFAULT_LOCALE];
  let languages = Array.isArray(source.languages) ? source.languages : [];
  let preferences = languages.length > 0 ? languages : [source.language];
  let normalized = normalizeLocalePreferences(preferences);
  return normalized.length > 0 ? normalized : [DEFAULT_LOCALE];
}

export function normalizeLocale(value, options = {}) {
  let fallback = options.fallback ?? DEFAULT_LOCALE;
  if (value == null) return fallback;
  let tag = String(value).trim().toLowerCase().replaceAll('_', '-');
  if (!tag) return fallback;
  let base = tag.split('-')[0];
  return SUPPORTED_LOCALES.includes(base) ? base : fallback;
}

export function normalizeLocaleMode(value, options = {}) {
  let fallback = options.fallback ?? DEFAULT_LOCALE_MODE;
  if (value == null) return fallback;
  let tag = String(value).trim().toLowerCase().replaceAll('_', '-');
  if (!tag) return fallback;
  if (tag === DEFAULT_LOCALE_MODE) return DEFAULT_LOCALE_MODE;
  return normalizeLocale(tag, { fallback: '' }) || fallback;
}

export function resolveLocale(preferences, options = {}) {
  let fallback = normalizeLocale(options.fallback ?? DEFAULT_LOCALE);
  let values = Array.isArray(preferences) ? preferences : [preferences];
  for (let value of values) {
    let locale = normalizeLocale(value, { fallback: '' });
    if (locale) return locale;
  }
  return fallback;
}

export function resolveLocaleForMode(mode, preferences, options = {}) {
  let resolvedMode = normalizeLocaleMode(mode);
  if (resolvedMode === DEFAULT_LOCALE_MODE) {
    return resolveLocale(preferences, options);
  }
  return resolvedMode;
}

export function createLocaleDictionary(locale = DEFAULT_LOCALE, overrides = {}) {
  let resolvedLocale = normalizeLocale(locale);
  return {
    ...LOCALE_CATALOGS[DEFAULT_LOCALE],
    ...(LOCALE_CATALOGS[resolvedLocale] || {}),
    ...normalizeMessages(overrides),
  };
}

export function interpolateLocaleMessage(message, params = {}) {
  return String(message).replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match;
  });
}

function resolveConfiguredLocale(options = {}) {
  if (configuredLocaleMode !== DEFAULT_LOCALE_MODE) return configuredLocale;
  let preferences = options.preferences != null
    ? normalizeLocalePreferences(options.preferences)
    : configuredPreferences;
  if (preferences.length === 0) {
    preferences = getNavigatorLocalePreferences(options.navigator);
  }
  return resolveLocale(preferences, { fallback: options.fallbackLocale ?? DEFAULT_LOCALE });
}

export function createTranslator(options = {}) {
  let locale = options.locale != null
    ? normalizeLocale(options.locale)
    : resolveConfiguredLocale(options);
  let fallbackLocale = normalizeLocale(options.fallbackLocale ?? DEFAULT_LOCALE);
  let localeMessages = normalizeLocaleMessages(options.messages);
  let flatMessages = normalizeMessages(options.messages);
  let dictionary = {
    ...LOCALE_CATALOGS[fallbackLocale],
    ...(LOCALE_CATALOGS[locale] || {}),
    ...(configuredMessages[locale] || {}),
    ...(localeMessages[locale] || {}),
    ...flatMessages,
  };

  return (key, params = {}) => {
    let message = dictionary[key] ?? LOCALE_CATALOGS[fallbackLocale]?.[key] ?? key;
    return interpolateLocaleMessage(message, params);
  };
}

export function translate(key, params = {}, options = {}) {
  return createTranslator(options)(key, params);
}

export function configureLocalization(options = {}) {
  let nextMessages = normalizeLocaleMessages(options.messages);
  for (let [locale, messages] of Object.entries(nextMessages)) {
    configuredMessages[locale] = {
      ...(configuredMessages[locale] || {}),
      ...messages,
    };
  }

  let flatMessages = normalizeMessages(options.messages);
  if (Object.keys(flatMessages).length > 0) {
    configuredMessages[configuredLocale] = {
      ...(configuredMessages[configuredLocale] || {}),
      ...flatMessages,
    };
  }

  if (options.mode != null) {
    configuredLocaleMode = normalizeLocaleMode(options.mode);
    configuredPreferences = normalizeLocalePreferences(
      options.preferences ?? getNavigatorLocalePreferences(options.navigator),
    );
    configuredLocale = resolveLocaleForMode(
      configuredLocaleMode,
      configuredPreferences,
      { fallback: options.fallbackLocale ?? DEFAULT_LOCALE },
    );
    explicitlyConfiguredLocale = options.explicit ?? configuredLocaleMode !== DEFAULT_LOCALE_MODE;
  }

  if (options.locale != null) {
    configuredLocale = normalizeLocale(options.locale);
    configuredLocaleMode = configuredLocale;
    configuredPreferences = [configuredLocale];
    explicitlyConfiguredLocale = options.explicit !== false;
  }

  return getLocalization();
}

export function getLocalization() {
  let locale = resolveConfiguredLocale();
  return {
    locale,
    mode: configuredLocaleMode,
    defaultLocale: DEFAULT_LOCALE,
    defaultMode: DEFAULT_LOCALE_MODE,
    supportedLocales: [...SUPPORTED_LOCALES],
    supportedModes: [...SUPPORTED_LOCALE_MODES],
    explicit: explicitlyConfiguredLocale,
    messages: createLocaleDictionary(locale, configuredMessages[locale]),
    t: createTranslator({ locale }),
  };
}

export function resetLocalization() {
  configuredLocale = DEFAULT_LOCALE;
  configuredLocaleMode = DEFAULT_LOCALE_MODE;
  configuredMessages = {};
  explicitlyConfiguredLocale = false;
  configuredPreferences = [];
  return getLocalization();
}

export function isLocalizationExplicit() {
  return explicitlyConfiguredLocale;
}

export function applyLocalizationToDocument(localization = getLocalization(), options = {}) {
  let doc = options.document || globalThis.document;
  if (!doc?.documentElement) return localization;
  let locale = normalizeLocale(localization?.locale);
  doc.documentElement.lang = locale;
  doc.documentElement.dir = options.dir || 'ltr';
  doc.documentElement.dataset.locale = locale;
  doc.documentElement.dataset.localeMode = localization?.mode || configuredLocaleMode;
  return localization;
}

export function configureAutoLocalization(options = {}) {
  let localization = configureLocalization({
    ...options,
    mode: options.mode ?? DEFAULT_LOCALE_MODE,
    preferences: options.preferences ?? getNavigatorLocalePreferences(options.navigator),
    explicit: options.explicit ?? false,
  });
  if (options.document !== false) {
    applyLocalizationToDocument(localization, {
      document: options.document,
      dir: options.dir,
    });
  }
  return localization;
}
