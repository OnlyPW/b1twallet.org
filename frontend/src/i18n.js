import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      nav: { home: 'Home', dashboard: 'Dashboard', send: 'Send', receive: 'Receive', explorer: 'Explorer', mempool: 'Mempool', addresses: 'Addresses' },
      actions: { lockWallet: 'Lock Wallet', refresh: 'Refresh', copy: 'Copy', dismiss: 'Dismiss' },
      footer: { docs: 'Docs', github: 'GitHub', discord: 'Discord', copy: '© 2025 B1T Labs. Non-custodial & Open Source.' },
      dashboard: { title: 'Dashboard', welcome: 'Welcome back!' },
      indexer: { label: 'Indexer', status: { disabled: 'Disabled', syncing: 'Syncing', caught_up: 'Synchronized', unknown: 'Unknown' }, dbTip: 'Tip (DB)', chainTip: 'Chain', currentHeight: 'Current Block Height' },
      balance: { 
        total: 'Total Balance',
        confirmed: 'Confirmed',
        available: 'Available',
        effective: 'Effective',
        pendingIn: 'Mempool incoming',
        pendingOut: 'Mempool outgoing'
      },
      address: { active: 'Active Address' },
      quick: { send: { title: 'Send B1T', subtitle: 'Create transaction' }, receive: { title: 'Receive B1T', subtitle: 'Show QR code' } },
      send: {
        title: 'Send B1T',
        available: 'Available',
        fromLabel: 'Sender address',
        onlyFundedLabel: 'Show only funded addresses',
        allOption: 'All addresses · Sum: {{sum}} B1T',
        recipientLabel: 'Recipient address',
        recipientPlaceholder: 'Enter B1T address',
        amountLabel: 'Amount (B1T)',
        amountPlaceholder: '0.00000000',
        max: 'MAX',
        feeLabel: 'Network fee (B1T)',
        feeSuggestionMinimum: 'Suggestion: {{suggested}} · Minimum: {{min}}',
        cautionCover: 'Make sure amount plus fee is covered by available balance.',
        cautionIrreversible: 'Transactions cannot be reversed!',
        submit: 'Send B1T',
        submitting: 'Sending transaction...',
        addrItem: '#{{i}} · {{short}} · {{balance}} B1T',
        toast: {
          sent: 'Transaction sent! TXID: {{txid}}',
          noAddress: 'No address found',
          locked: 'Wallet is locked. Please re-import.',
          invalidAmount: 'Invalid amount',
          insufficient: 'Insufficient funds',
          genericError: 'Error: {{message}}'
        }
      },
      tx: { latest: 'Latest Transactions', refresh: 'Refresh', none: 'No transactions yet', none_subtitle: 'Your transactions will appear here', confirmations: 'Confirmations' },
      home: {
        hero: {
          subtitle: 'Your modern, secure, non-custodial wallet for B1T and Ordinals.',
          tagline: 'Be your own Bank.'
        },
        cta: {
          dashboard: 'Go to Dashboard',
          create: 'Create New Wallet',
          import: 'Import Wallet'
        },
        features: {
          nonCustodial: {
            title: 'Non-Custodial',
            desc: 'Full control over your private keys. Your coins, your responsibility.'
          },
          ordinals: {
            title: 'Ordinals Ready',
            desc: 'Ordinals features are in progress; create/manage/transfer coming soon.'
          },
          bip39: {
            title: 'BIP39 Compatible',
            desc: 'Import existing seeds from other wallets.'
          },
          openSource: {
            title: 'Open Source',
            desc: 'Transparent code. No hidden features. Community-driven.'
          }
        },
        info: {
          title: 'Why B1T Wallet?',
          desc: 'B1T Wallet is a fully integrated solution for the B1T blockchain with native Ordinals support. Manage your B1T coins and Ordinals in a modern, user-friendly interface — without compromising on security or self-sovereignty.',
          phase: '🔥 Phase 1 is live! Ordinals features coming in Phase 2–4.'
        }
      },
      beta: { title: 'Beta Notice', message: 'This wallet is in beta. Use with caution.' },
      explorer: {
        searchPlaceholder: 'Address, txid, block hash or height',
        searchHint: 'Search addresses, blocks and transactions',
        summary: 'Summary',
        rawTitle: 'RAW Result',
        details: 'Details',
        address: 'Address',
        sent: 'Sent',
        received: 'Received',
        txCount: 'Tx Count',
        inputs: 'Inputs',
        outputs: 'Outputs',
        amount: 'Amount',
        from: 'From',
        to: 'To',
        coinbase: 'Coinbase',
        newBlock: 'New Block',
        fee: 'Fee',
        block: 'Block',
        height: 'Height',
        time: 'Time',
        hash: 'Hash',
        open: 'Open',
        copySuccess: 'Copied!'
      },
      mempool: {
        title: 'Mempool',
        status: 'Status',
        refresh: 'Refresh',
        loading: 'Loading...',
        size: 'Size',
        bytes: 'Bytes',
        usage: 'Usage',
        minFee: 'Min Fee',
        txids: 'TxIDs',
        none: 'No mempool transactions found.',
        raw: 'RAW View',
        loadingTx: 'Loading transaction...',
        selectPrompt: 'Select a TXID on the left to view details.',
        verbose: 'Verbose',
        searchPlaceholder: 'Search TXID...',
        fee: 'Fee',
        feeRate: 'Fee rate',
        satVB: 'sat/vB',
        time: 'Time',
        ancestors: 'Ancestors',
        descendants: 'Descendants',
        replaceable: 'Replaceable',
        openExplorer: 'Open in Explorer',
        toast: { incoming: 'Incoming payment detected: +{{delta}} B1T to address #{{index}}' }
      }
    }
  },
  de: {
    translation: {
      nav: { home: 'Home', dashboard: 'Dashboard', send: 'Senden', receive: 'Empfangen', explorer: 'Explorer', mempool: 'Mempool', addresses: 'Adressen' },
      actions: { lockWallet: 'Wallet sperren', refresh: 'Aktualisieren', copy: 'Kopieren', dismiss: 'Ausblenden' },
      footer: { docs: 'Docs', github: 'GitHub', discord: 'Discord', copy: '© 2025 B1T Labs. Non-custodial & Open Source.' },
      dashboard: { title: 'Dashboard', welcome: 'Willkommen zurück!' },
      indexer: { label: 'Indexer', status: { disabled: 'Deaktiviert', syncing: 'Synchronisiere', caught_up: 'Synchron', unknown: 'Unbekannt' }, dbTip: 'Tip (DB)', chainTip: 'Chain', currentHeight: 'Aktuelle Blockhöhe' },
      balance: { 
        total: 'Gesamt Guthaben',
        confirmed: 'Bestätigt',
        available: 'Verfügbar',
        effective: 'Effektiv',
        pendingIn: 'Mempool Eingang',
        pendingOut: 'Mempool Ausgang'
      },
      address: { active: 'Aktive Adresse' },
      quick: { send: { title: 'B1T senden', subtitle: 'Transaktion erstellen' }, receive: { title: 'B1T empfangen', subtitle: 'QR-Code anzeigen' } },
      send: {
        title: 'B1T senden',
        available: 'Verfügbar',
        fromLabel: 'Absender Adresse',
        onlyFundedLabel: 'Nur Adressen mit Guthaben anzeigen',
        allOption: 'Alle Adressen · Summe: {{sum}} B1T',
        recipientLabel: 'Empfänger Adresse',
        recipientPlaceholder: 'B1T Adresse eingeben',
        amountLabel: 'Betrag (B1T)',
        amountPlaceholder: '0.00000000',
        max: 'MAX',
        feeLabel: 'Netzwerk-Gebühr (B1T)',
        feeSuggestionMinimum: 'Vorschlag: {{suggested}} · Minimum: {{min}}',
        cautionCover: 'Achte darauf, dass der Betrag inkl. Gebühr vom verfügbaren Guthaben abgedeckt ist.',
        cautionIrreversible: 'Transaktionen können nicht rückgängig gemacht werden!',
        submit: 'B1T senden',
        submitting: 'Sende Transaktion...',
        addrItem: '#{{i}} · {{short}} · {{balance}} B1T',
        toast: {
          sent: 'Transaktion gesendet! TXID: {{txid}}',
          noAddress: 'Keine Adresse gefunden',
          locked: 'Wallet ist gesperrt. Bitte neu importieren.',
          invalidAmount: 'Ungültiger Betrag',
          insufficient: 'Unzureichendes Guthaben',
          genericError: 'Fehler: {{message}}'
        }
      },
      tx: { latest: 'Letzte Transaktionen', refresh: 'Aktualisieren', none: 'Noch keine Transaktionen', none_subtitle: 'Ihre Transaktionen werden hier angezeigt', confirmations: 'Bestätigungen' },
      home: {
        hero: {
          subtitle: 'Deine moderne, sichere, non-custodial Wallet für B1T und Ordinals.',
          tagline: 'Sei deine eigene Bank.'
        },
        cta: {
          dashboard: 'Zum Dashboard',
          create: 'Neue Wallet erstellen',
          import: 'Wallet importieren'
        },
        features: {
          nonCustodial: {
            title: 'Non-Custodial',
            desc: 'Vollständige Kontrolle über deine Private Keys. Deine Coins, deine Verantwortung.'
          },
          ordinals: {
            title: 'Ordinals Ready',
            desc: 'Ordinals‑Funktionen sind in Arbeit; Erstellung/Verwaltung/Übertragung folgen bald.'
          },
          bip39: {
            title: 'BIP39 Kompatibel',
            desc: 'Importiere bestehende Seeds aus anderen Wallets.'
          },
          openSource: {
            title: 'Open Source',
            desc: 'Transparenter Code. Keine versteckten Funktionen. Community-getrieben.'
          }
        },
        info: {
          title: 'Warum B1T Wallet?',
          desc: 'B1T Wallet ist die erste vollständig integrierte Lösung für die B1T-Blockchain mit nativem Ordinals-Support. Verwalte deine B1T-Coins und Ordinals in einer modernen, benutzerfreundlichen Oberfläche — ohne Kompromisse bei Sicherheit und Selbstbestimmung.',
          phase: '🔥 Phase 1 ist live! Ordinals-Features folgen in Phase 2–4.'
        }
      },
      beta: { title: 'Beta-Hinweis', message: 'Diese Wallet befindet sich in der Beta-Phase. Bitte mit Vorsicht nutzen.' },
      explorer: {
        searchPlaceholder: 'Adresse, TXID, Block-Hash oder Höhe',
        searchHint: 'Suche nach Adressen, Blöcken und Transaktionen',
        summary: 'Übersicht',
        rawTitle: 'RAW Ergebnis',
        details: 'Details',
        address: 'Adresse',
        sent: 'Gesendet',
        received: 'Empfangen',
        txCount: 'Transaktionen',
        inputs: 'Eingänge',
        outputs: 'Ausgänge',
        amount: 'Betrag',
        from: 'Von',
        to: 'An',
        coinbase: 'Coinbase',
        newBlock: 'Neuer Block',
        fee: 'Gebühr',
        block: 'Block',
        height: 'Höhe',
        time: 'Zeit',
        hash: 'Hash',
        open: 'Öffnen',
        copySuccess: 'Kopiert!'
      },
      mempool: {
        title: 'Mempool',
        status: 'Status',
        refresh: 'Aktualisieren',
        loading: 'Lade...',
        size: 'Größe',
        bytes: 'Bytes',
        usage: 'Nutzung',
        minFee: 'Min Gebühr',
        txids: 'TxIDs',
        none: 'Keine Mempool-Transaktionen gefunden.',
        raw: 'RAW Anzeige',
        loadingTx: 'Lade Transaktion...',
        selectPrompt: 'Wähle links eine TXID, um Details anzuzeigen.',
        verbose: 'Ausführlich',
        searchPlaceholder: 'TXID suchen...',
        fee: 'Gebühr',
        feeRate: 'Gebührensatz',
        satVB: 'sat/vB',
        time: 'Zeit',
        ancestors: 'Vorfahren',
        descendants: 'Nachfahren',
        replaceable: 'Ersetzbar',
        openExplorer: 'Im Explorer öffnen'
      }
    }
  },
  fr: { 
    translation: {
      nav: { home: 'Accueil', dashboard: 'Tableau de bord', send: 'Envoyer', receive: 'Recevoir', explorer: 'Explorateur', mempool: 'Mempool', addresses: 'Adresses' },
      actions: { lockWallet: 'Verrouiller le portefeuille', refresh: 'Actualiser' },
      footer: { docs: 'Docs', github: 'GitHub', discord: 'Discord', copy: '© 2025 B1T Labs. Non-custodial & Open Source.' },
      dashboard: { title: 'Tableau de bord', welcome: 'Bon retour !' },
      indexer: { label: 'Indexeur', status: { disabled: 'Désactivé', syncing: 'Synchronisation', caught_up: 'Synchronisé', unknown: 'Inconnu' }, dbTip: 'Tip (DB)', chainTip: 'Chaîne', currentHeight: 'Hauteur de bloc actuelle' },
      balance: { total: 'Solde total' },
      address: { active: 'Adresse active' },
      quick: { send: { title: 'Envoyer B1T', subtitle: 'Créer une transaction' }, receive: { title: 'Recevoir B1T', subtitle: 'Afficher le QR code' } },
      tx: { latest: 'Dernières transactions', refresh: 'Actualiser', none: 'Aucune transaction', none_subtitle: 'Vos transactions apparaîtront ici', confirmations: 'Confirmations' },
      home: {
        hero: {
          subtitle: 'Votre portefeuille moderne, sécurisé et non conservateur pour B1T et Ordinals.',
          tagline: 'Soyez votre propre banque.'
        },
        cta: { dashboard: 'Aller au tableau de bord', create: 'Créer un nouveau portefeuille', import: 'Importer un portefeuille' },
        features: {
          nonCustodial: { title: 'Sans garde', desc: 'Contrôle total de vos clés privées. Vos coins, votre responsabilité.' },
          ordinals: { title: 'Ordinals bientôt', desc: 'Fonctionnalités Ordinals en cours; création/gestion/transfert bientôt disponibles.' },
          bip39: { title: 'Compatible BIP39', desc: 'Importez des seeds existants d\'autres portefeuilles.' },
          openSource: { title: 'Open Source', desc: 'Code transparent. Aucune fonction cachée. Porté par la communauté.' }
        },
        info: {
          title: 'Pourquoi B1T Wallet ?',
          desc: 'B1T Wallet est une solution entièrement intégrée pour la blockchain B1T avec prise en charge native des Ordinals. Gérez vos B1T coins et Ordinals dans une interface moderne et conviviale — sans compromis sur la sécurité ou la souveraineté.',
          phase: '🔥 La phase 1 est en ligne ! Les fonctionnalités Ordinals arrivent aux phases 2–4.'
        }
      },
      mempool: { title: 'Mempool', status: 'Statut', refresh: 'Actualiser', loading: 'Chargement...', size: 'Taille', bytes: 'Octets', usage: 'Utilisation', minFee: 'Frais min', txids: 'TxIDs', none: 'Aucune transaction dans le mempool.', raw: 'Vue RAW', loadingTx: 'Chargement de la transaction...', selectPrompt: 'Sélectionnez une TXID à gauche pour voir les détails.' }
    }
  },
  ru: {
    translation: {
      nav: { home: 'Домой', dashboard: 'Панель', send: 'Отправить', receive: 'Получить', explorer: 'Обозреватель', mempool: 'Мемпул', addresses: 'Адреса' },
      actions: { lockWallet: 'Заблокировать кошелёк', refresh: 'Обновить' },
      footer: { docs: 'Документация', github: 'GitHub', discord: 'Discord', copy: '© 2025 B1T Labs. Некастодиально и с открытым исходным кодом.' },
      dashboard: { title: 'Панель', welcome: 'С возвращением!' },
      indexer: { label: 'Индексатор', status: { disabled: 'Отключено', syncing: 'Синхронизация', caught_up: 'Синхронизировано', unknown: 'Неизвестно' }, dbTip: 'Tip (DB)', chainTip: 'Цепь', currentHeight: 'Текущая высота блока' },
      balance: { total: 'Общий баланс' },
      address: { active: 'Активный адрес' },
      quick: { send: { title: 'Отправить B1T', subtitle: 'Создать транзакцию' }, receive: { title: 'Получить B1T', subtitle: 'Показать QR-код' } },
      tx: { latest: 'Последние транзакции', refresh: 'Обновить', none: 'Транзакций нет', none_subtitle: 'Ваши транзакции появятся здесь', confirmations: 'Подтверждения' },
      home: {
        hero: { subtitle: 'Современный, безопасный, некастодиальный кошелёк для B1T и Ordinals.', tagline: 'Будь своей собственной банком.' },
        cta: { dashboard: 'Перейти к панели', create: 'Создать новый кошелёк', import: 'Импортировать кошелёк' },
        features: {
          nonCustodial: { title: 'Некастодиальный', desc: 'Полный контроль над приватными ключами. Ваши монеты — ваша ответственность.' },
          ordinals: { title: 'Ordinals скоро', desc: 'Функции Ordinals в разработке; создание/управление/передача скоро.' },
          bip39: { title: 'Совместим с BIP39', desc: 'Импортируйте существующие сид-фразы из других кошельков.' },
          openSource: { title: 'Open Source', desc: 'Прозрачный код. Никаких скрытых функций. Сообщество рулит.' }
        },
        info: { title: 'Почему B1T Wallet?', desc: 'B1T Wallet — полностью интегрированное решение для блокчейна B1T с родной поддержкой Ordinals. Управляйте монетами B1T и Ordinals в современной и удобной оболочке — без компромиссов в безопасности и самостоятельности.', phase: '🔥 Фаза 1 уже запущена! Функции Ordinals появятся в фазах 2–4.' }
      },
      mempool: { title: 'Мемпул', status: 'Статус', refresh: 'Обновить', loading: 'Загрузка...', size: 'Размер', bytes: 'Байт', usage: 'Использование', minFee: 'Мин комиссия', txids: 'TxIDs', none: 'Нет транзакций в мемпуле.', raw: 'RAW просмотр', loadingTx: 'Загрузка транзакции...', selectPrompt: 'Выберите TXID слева, чтобы увидеть детали.' }
    }
  },
  zh: {
    translation: {
      nav: { home: '首页', dashboard: '仪表盘', send: '发送', receive: '接收', explorer: '区块浏览器', mempool: '内存池', addresses: '地址' },
      actions: { lockWallet: '锁定钱包', refresh: '刷新' },
      footer: { docs: '文档', github: 'GitHub', discord: 'Discord', copy: '© 2025 B1T Labs. 去托管与开源。' },
      dashboard: { title: '仪表盘', welcome: '欢迎回来！' },
      indexer: { label: '索引器', status: { disabled: '已禁用', syncing: '同步中', caught_up: '已同步', unknown: '未知' }, dbTip: 'Tip (DB)', chainTip: '链', currentHeight: '当前区块高度' },
      balance: { total: '总余额' },
      address: { active: '活动地址' },
      quick: { send: { title: '发送 B1T', subtitle: '创建交易' }, receive: { title: '接收 B1T', subtitle: '显示二维码' } },
      tx: { latest: '最新交易', refresh: '刷新', none: '暂无交易', none_subtitle: '您的交易将显示在此处', confirmations: '确认数' },
      home: {
        hero: { subtitle: '现代、安全、去托管的 B1T 与 Ordinals 钱包。', tagline: '做你自己的银行。' },
        cta: { dashboard: '进入仪表盘', create: '创建新钱包', import: '导入钱包' },
        features: {
          nonCustodial: { title: '去托管', desc: '完全掌控你的私钥。你的币，你做主。' },
          ordinals: { title: 'Ordinals 即将推出', desc: 'Ordinals 功能开发中；创建/管理/转移即将推出。' },
          bip39: { title: '兼容 BIP39', desc: '从其他钱包导入现有种子。' },
          openSource: { title: '开源', desc: '透明代码。无隐藏功能。由社区驱动。' }
        },
        info: { title: '为什么选择 B1T Wallet？', desc: 'B1T Wallet 是面向 B1T 区块链的完整解决方案，原生支持 Ordinals。以现代、易用的界面管理你的 B1T 资产与 Ordinals —— 安全与主权不妥协。', phase: '🔥 第 1 阶段已上线！Ordinals 功能将在第 2–4 阶段推出。' }
      },
      mempool: { title: '内存池', status: '状态', refresh: '刷新', loading: '加载中...', size: '大小', bytes: '字节', usage: '使用量', minFee: '最低手续费', txids: 'TxIDs', none: '未找到内存池交易。', raw: 'RAW 视图', loadingTx: '正在加载交易...', selectPrompt: '在左侧选择一个 TXID 查看详情。' }
    }
  },
  vi: {
    translation: {
      nav: { home: 'Trang chủ', dashboard: 'Bảng điều khiển', send: 'Gửi', receive: 'Nhận', explorer: 'Trình khám phá', mempool: 'Mempool' },
      actions: { lockWallet: 'Khóa ví', refresh: 'Làm mới' },
      footer: { docs: 'Docs', github: 'GitHub', discord: 'Discord', copy: '© 2025 B1T Labs. Không lưu ký & Mã nguồn mở.' },
      dashboard: { title: 'Bảng điều khiển', welcome: 'Chào mừng trở lại!' },
      indexer: { label: 'Bộ lập chỉ mục', status: { disabled: 'Tắt', syncing: 'Đang đồng bộ', caught_up: 'Đã đồng bộ', unknown: 'Không rõ' }, dbTip: 'Tip (DB)', chainTip: 'Chuỗi', currentHeight: 'Độ cao khối hiện tại' },
      balance: { total: 'Tổng số dư' },
      address: { active: 'Địa chỉ đang dùng' },
      quick: { send: { title: 'Gửi B1T', subtitle: 'Tạo giao dịch' }, receive: { title: 'Nhận B1T', subtitle: 'Hiển thị mã QR' } },
      tx: { latest: 'Giao dịch gần đây', refresh: 'Làm mới', none: 'Chưa có giao dịch', none_subtitle: 'Giao dịch của bạn sẽ xuất hiện tại đây', confirmations: 'Xác nhận' },
      home: {
        hero: { subtitle: 'Ví hiện đại, an toàn, không lưu ký cho B1T và Ordinals.', tagline: 'Hãy là ngân hàng của chính bạn.' },
        cta: { dashboard: 'Tới bảng điều khiển', create: 'Tạo ví mới', import: 'Nhập ví' },
        features: {
          nonCustodial: { title: 'Không lưu ký', desc: 'Toàn quyền kiểm soát khóa riêng. Coin của bạn, trách nhiệm của bạn.' },
          ordinals: { title: 'Ordinals sắp có', desc: 'Tính năng Ordinals đang phát triển; tạo/quản lý/chuyển sắp có.' },
          bip39: { title: 'Tương thích BIP39', desc: 'Nhập seed có sẵn từ ví khác.' },
          openSource: { title: 'Mã nguồn mở', desc: 'Mã minh bạch. Không tính năng ẩn. Do cộng đồng dẫn dắt.' }
        },
        info: { title: 'Vì sao chọn B1T Wallet?', desc: 'B1T Wallet là giải pháp tích hợp cho blockchain B1T với hỗ trợ Ordinals gốc. Quản lý B1T coin và Ordinals trong giao diện hiện đại, thân thiện — không thỏa hiệp về bảo mật và tự chủ.', phase: '🔥 Giai đoạn 1 đã hoạt động! Tính năng Ordinals sẽ ra mắt ở giai đoạn 2–4.' }
      },
      mempool: { title: 'Mempool', status: 'Trạng thái', refresh: 'Làm mới', loading: 'Đang tải...', size: 'Kích thước', bytes: 'Byte', usage: 'Sử dụng', minFee: 'Phí tối thiểu', txids: 'TxIDs', none: 'Không có giao dịch trong mempool.', raw: 'RAW', loadingTx: 'Đang tải giao dịch...', selectPrompt: 'Chọn một TXID bên trái để xem chi tiết.' }
    }
  },
  id: {
    translation: {
      nav: { home: 'Beranda', dashboard: 'Dasbor', send: 'Kirim', receive: 'Terima', explorer: 'Explorer', mempool: 'Mempool' },
      actions: { lockWallet: 'Kunci Dompet', refresh: 'Segarkan' },
      footer: { docs: 'Docs', github: 'GitHub', discord: 'Discord', copy: '© 2025 B1T Labs. Non-custodial & Open Source.' },
      dashboard: { title: 'Dasbor', welcome: 'Selamat datang kembali!' },
      indexer: { label: 'Pengindeks', status: { disabled: 'Dinonaktifkan', syncing: 'Sinkronisasi', caught_up: 'Tersinkron', unknown: 'Tidak diketahui' }, dbTip: 'Tip (DB)', chainTip: 'Rantai', currentHeight: 'Ketinggian Blok Saat Ini' },
      balance: { total: 'Saldo Total' },
      address: { active: 'Alamat Aktif' },
      quick: { send: { title: 'Kirim B1T', subtitle: 'Buat transaksi' }, receive: { title: 'Terima B1T', subtitle: 'Tampilkan kode QR' } },
      tx: { latest: 'Transaksi terbaru', refresh: 'Segarkan', none: 'Belum ada transaksi', none_subtitle: 'Transaksi Anda akan muncul di sini', confirmations: 'Konfirmasi' },
      home: {
        hero: { subtitle: 'Dompet modern, aman, non-custodial untuk B1T dan Ordinals.', tagline: 'Jadilah bank Anda sendiri.' },
        cta: { dashboard: 'Ke Dasbor', create: 'Buat Dompet Baru', import: 'Impor Dompet' },
        features: {
          nonCustodial: { title: 'Non-custodial', desc: 'Kendalikan sepenuhnya private key Anda. Koin Anda, tanggung jawab Anda.' },
          ordinals: { title: 'Ordinals segera hadir', desc: 'Fitur Ordinals sedang dikerjakan; buat/kelola/transfer segera hadir.' },
          bip39: { title: 'Kompatibel BIP39', desc: 'Impor seed yang sudah ada dari dompet lain.' },
          openSource: { title: 'Sumber Terbuka', desc: 'Kode transparan. Tanpa fitur tersembunyi. Digerakkan komunitas.' }
        },
        info: { title: 'Mengapa B1T Wallet?', desc: 'B1T Wallet adalah solusi terintegrasi untuk blockchain B1T dengan dukungan Ordinals native. Kelola koin B1T dan Ordinals dalam antarmuka modern dan ramah pengguna — tanpa kompromi keamanan dan kedaulatan.', phase: '🔥 Fase 1 sudah aktif! Fitur Ordinals akan hadir di Fase 2–4.' }
      },
      mempool: { title: 'Mempool', status: 'Status', refresh: 'Segarkan', loading: 'Memuat...', size: 'Ukuran', bytes: 'Byte', usage: 'Penggunaan', minFee: 'Biaya minimum', txids: 'TxIDs', none: 'Tidak ada transaksi mempool.', raw: 'RAW', loadingTx: 'Memuat transaksi...', selectPrompt: 'Pilih TXID di kiri untuk melihat detail.' }
    }
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'de', 'fr', 'ru', 'zh', 'vi', 'id'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    debug: false,
  });

export default i18n;