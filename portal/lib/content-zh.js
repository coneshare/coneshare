import Image from 'next/image';
import Link from 'next/link';
import { ZoomableImage } from '../components/ZoomableImage';

export const FEATURE_LAYER_GROUPS_ZH = [
  {
    key: 'control',
    title: '受控安全层',
    description: '为对外分发的敏感文件叠加密码、验证、水印与过期管控。',
    slugs: ['secure-sharing', 'dynamic-watermarking', 'online-document-preview', 'file-requests'],
  },
  {
    key: 'intelligence',
    title: '行为洞察层',
    description: '通过可量化的逐页阅读时长与会话轨迹洞察真实意向。',
    slugs: ['advanced-analytics', 'virtual-data-rooms'],
  },
  {
    key: 'action',
    title: '工作流联动层',
    description: '把文档阅读事件转化为企业微信、飞书、Slack 与 Webhook 自动化协同。',
    slugs: ['workflow-automation-integration'],
  },
  {
    key: 'foundation',
    title: '基础设施层',
    description: '直连现有云盘工作流，并支持在自有服务器私有化部署。',
    slugs: ['cloud-storage-integration', 'self-hosted'],
  },
];

export const FEATURES_ZH = {
  'secure-sharing': {
    name: '安全文档与资料室分发',
    menuName: '受控安全外发',
    description: '通过受控分享链接、细粒度访问权限和资料室级隔离规则，安心对外分发敏感商业资料。',
    keywords: ['安全文档分享', '加密外链', '文档权限控制', '在线更新不失效链接'],
    docsHref: '/zh/help/secure-sharing',
    docsLabel: '查看使用指南',
    workflowSteps: [
      '为外发链接设置访问密码、邮箱验证与过期时间限制。',
      '将方案、商业计划书或资料室链接发送给外部接收方。',
      '接收方仅能在其权限范围内浏览或下载内容。',
      '团队随时上传新版文件，已有外链自动指向最新版本而不失效。',
    ],
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">细粒度访问控制</h3>
        <p className="mb-4">
          为每条分享链接配置完善的安全防护选项，包括访问密码、邮箱身份验证、下载限制以及自动过期时间，确保资料传播始终处于可控边界内。
        </p>
        <Image
          src="/screenshots/feat-sharing.png"
          alt="创建安全分享链接与权限设置的界面截图"
          width={1200}
          height={750}
          className="my-6 rounded-lg shadow-lg border"
        />

        <h3 className="text-xl font-semibold mb-4">实时更新文件而不改变链接</h3>
        <p>
          发现错别字或需要更新报价数据时，直接上传新版本即可。原有分享链接的 URL 与访问规则保持不变，接收方再次打开自动呈现最新内容。
        </p>
        <Image
          src="/screenshots/feat-sharing2.png"
          alt="在文档详情中更新版本且保持原分享链接有效的界面截图"
          width={1200}
          height={750}
          className="my-6 rounded-lg shadow-lg border"
        />
      </div>
    ),
  },
  'advanced-analytics': {
    name: '逐页阅读统计与行为洞察',
    menuName: '逐页阅读分析',
    description: '精确统计幻灯片与文档每一页的停留时长，实时监测资料室阅读意向，在关键材料被打开或重访时第一时间收到告警。',
    keywords: ['逐页阅读分析', '访客会话审计', '文档打开通知', '阅读停留时长'],
    docsHref: '/zh/help/analytics-and-mcp',
    docsLabel: '查看使用指南',
    workflowSteps: [
      '向客户或投资人发送提案、商业计划书或资料室链接。',
      'Coneshare 自动采集每一页的停留秒数、完读率与文内链接点击。',
      '通过访客会话日志查看访问者身份、来源地区与重点关注的目录内容。',
      '当文件被打开、重复访问或下载时，立即通过邮件、Slack 或 Webhook 推送提醒。',
    ],
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-3">1. 精确到秒的逐页停留时长</h3>
        <p className="mb-4">
          传统网盘链接发出后就像石沉大海。Coneshare 会按页拆解每一次阅读会话，统计方案演示、财务模型和合同条款每一页的观看时长与整体完读率。
        </p>
        <p className="mb-4">
          通过横向对比各页面耗时，销售和交易团队可以一眼看穿对方关注点。如果客户快速略过公司简介，却在报价表和实施路线图页停留了四分钟，下次沟通该聊什么自然一清二楚。
        </p>

        <h3 className="text-xl font-semibold mt-10 mb-3">2. 访客会话日志与资料室审计轨迹</h3>
        <p className="mb-4">
          每次打开文档都会生成结构化的会话档案，包括已验证邮箱、地理位置、IP 地址、设备系统及访问时间戳。
        </p>
        <p className="mb-4">
          在虚拟资料室中，还能完整记录访客在多层目录间的浏览路径、翻阅过哪些核心文档、是否执行下载或打印；一旦链接被转发给其内部其他同事，也会形成独立会话，帮团队提前感知采购决策链条。
        </p>

        <div className="my-6">
          <ZoomableImage
            src="/screenshots/feat-visitor-sessions.png"
            alt="包含邮箱验证、阅读时长与资料室浏览轨迹的访客会话日志截图"
            width={1512}
            height={953}
            className="rounded-lg shadow-lg border border-gray-200"
          />
          <p className="mt-2 text-center text-xs text-gray-500">
            访客会话审计日志：查看单次访问详情、已验证身份、完读率与目录阅读记录。
          </p>
        </div>

        <h3 className="text-xl font-semibold mt-10 mb-3">3. 文内链接点击与视频播放遥测</h3>
        <p className="mb-4">行为分析不止覆盖静态文档页面：</p>
        <ul className="list-disc pl-5 space-y-2 mb-4 text-sm text-gray-700">
          <li>
            <strong>链接点击追踪：</strong>监控访客何时点击文档中嵌入的外部演示链接、日程预约地址或附录参考 URL。
          </li>
          <li>
            <strong>视频播放遥测：</strong>针对产品演示和架构讲解视频，记录观看片段、总时长、进度条拖拽、静音状态与倍速设置。
          </li>
          <li>
            <strong>电子表格查阅：</strong>掌握财务预测表和多 Sheet 工作簿何时被翻看，同时保护原始公式文件不外泄。
          </li>
        </ul>

        <h3 className="text-xl font-semibold mt-10 mb-3">4. 实时事件告警与团队协同通知</h3>
        <p className="mb-4">
          竞争激烈的交易中，响应时机决定结果。当外部干系人打开或下载资料的瞬间，Coneshare 可通过邮件、Slack 频道或自定义 Webhook（如对接企微/飞书）触发告警。
        </p>
        <p className="mb-4">
          当沉寂数日的投资人重新翻阅 BP、客户下载主协议，或者出现同域名多名新访客同时浏览时，团队都能第一时间联动跟进。
        </p>

        <div className="my-6">
          <ZoomableImage
            src="/screenshots/feat-notification.png"
            alt="实时文档阅读与高频交互事件通知截图"
            width={1259}
            height={883}
            className="rounded-lg shadow-lg border border-gray-200"
          />
          <p className="mt-2 text-center text-xs text-gray-500">
            实时事件通知：在外部客户正打开查看方案的瞬间启动团队协同响应。
          </p>
        </div>
      </div>
    ),
  },
  'dynamic-watermarking': {
    name: '防拍照动态水印',
    menuName: '防拍照动态水印',
    description: '实时将查看者的邮箱、IP 地址与访问时间烧录到在线预览和下载页面上，有效震慑私自转发与截图泄密。',
    keywords: ['动态水印', '防截屏水印', 'PDF 水印溯源', '文档防泄密'],
    docsHref: '/zh/help/dynamic-watermarking',
    docsLabel: '查看使用指南',
    workflowSteps: [
      '配置包含访客身份占位符的动态水印模板。',
      '对需要保护的分享链接或资料室目录开启水印规则。',
      '接收方在在线预览或下载 PDF 时自动叠加个人专属标识。',
      '一旦发生疑似外泄，可通过页面上的身份水印快速溯源。',
    ],
    content: (
      <div className="space-y-12">
        <div>
          <h3 className="text-xl font-semibold mb-3">1. 绑定访客身份的动态水印模板</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            静态统一水印容易被忽略或涂抹。动态水印则将每一次文档打开行为直接与当前查看者绑定——在请求发生的瞬间，系统将访客已验证邮箱、当前 IP 地址和访问时间实时渲染到每一页内容中。
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            支持自由组合邮箱、日期等动态变量与自定义保密警示语。当接收方清楚看到屏幕各处印有自己身份标识时，随意截屏转发的风险会大幅降低。
          </p>
          <ZoomableImage
            src="/screenshots/feat-watermark.png"
            alt="支持访客身份变量与实时效果预览的动态水印配置界面"
            width={1200}
            height={750}
            className="my-6 rounded-lg shadow-lg border"
          />
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-3">2. 全画布斜向平铺，覆盖在线预览与 PDF 下载</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            仅放在浏览器角落的水印极易被裁剪掉。Coneshare 采用全画布斜向重复平铺矩阵渲染水印，兼顾正文可读性的同时，让人无法在不带上身份信息的前提下截取有效段落或整页拍照。
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            无论通过在线矢量预览还是导出下载的 PDF 副本，动态水印都会一并嵌入并保留，确保离线留存的文件同样可追踪到具体访问会话。
          </p>
          <ZoomableImage
            src="/screenshots/feat-watermark2.png"
            alt="在文档预览画布上斜向平铺呈现的动态水印效果"
            width={1200}
            height={750}
            className="my-6 rounded-lg shadow-lg border"
          />
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-3">3. 按链接独立控制与只读禁止下载</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            内部顾问与外部竞对方的安全级别并不相同。同一份文件可以生成多条链接：对外部沟通链接强制叠加水印、对已签约伙伴提供干净无水印版本，全程无需复制多份源文件。
          </p>
          <p className="text-muted-foreground leading-relaxed">
            将动态水印与禁止下载配合使用时，访客只能在浏览器中高质量只读查阅，进一步堵住源文件批量导出的途径。
          </p>
        </div>
      </div>
    ),
  },
  'virtual-data-rooms': {
    name: '虚拟资料室 (VDR)',
    menuName: '虚拟资料室 (VDR)',
    description: '在一个结构化门户中组织多级文件夹，为不同受众创建独立权限链接，内嵌上下文 Q&A 问答并自定义房间品牌视觉。',
    keywords: ['虚拟资料室', 'VDR 权限矩阵', '尽职调查数据室', 'Q&A 问答'],
    docsHref: '/zh/help/datarooms',
    docsLabel: '查看使用指南',
    workflowSteps: [
      '建立清晰的多级目录结构并按尽调清单顺序排列文档。',
      '为不同外部受众创建独立分享链接，分别设定文件夹可见性与水印策略。',
      '在资料室自带的 Q&A 线程中直接按链接隔离回复外部提问。',
      '自定义资料室横幅 Banner、品牌配色、文件编号索引与存储配额。',
    ],
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-3">1. 单一资料室，多条独立权限链接</h3>
        <p className="mb-4">
          不必为了区分买方、财务顾问和法务团队而复制好几套重复文件夹。Coneshare 支持对同一资料室签发多条访问链接，每条链接均可独立设置密码、过期时间、NDA 条款与允许浏览的子目录。
        </p>

        <div className="my-6">
          <ZoomableImage
            src="/screenshots/feat-vdr-multi-link.png"
            alt="为同一虚拟资料室管理多条独立权限链接的界面截图"
            width={1524}
            height={904}
            className="rounded-lg shadow-lg border border-gray-200"
          />
          <p className="mt-2 text-center text-xs text-gray-500">
            多链接管理：为不同访客群组创建带独立名称、访问规则与访问计数的入口。
          </p>
        </div>

        <p className="mb-4">
          可精确到每个文件夹和单份文档的可见、下载与水印权限——例如先向初步意向伙伴开放产品路线图与技术架构，待签署保密协议后再释放财务审计和股权结构明细。
        </p>

        <div className="my-6">
          <ZoomableImage
            src="/screenshots/feat-vdr-manage-perm.png"
            alt="针对不同分享链接细粒度配置文件夹和文档权限的面板截图"
            width={1335}
            height={882}
            className="rounded-lg shadow-lg border border-gray-200"
          />
          <p className="mt-2 text-center text-xs text-gray-500">
            权限矩阵表：逐目录和逐文档设定查看、下载及动态水印策略。
          </p>
        </div>

        <h3 className="text-xl font-semibold mt-10 mb-3">2. 资料室内嵌 Q&amp;A 问答协作</h3>
        <p className="mb-4">
          尽调过程中的问题经常散落在邮件附件和脱节的 Excel 表里。Coneshare 直接在资料室视图内置 Q&amp;A 面板，外部审核人员可针对特定文件发起提问，房主在统一控制台集中回复。
        </p>
        <p className="mb-4">
          所有问答线程均严格按分享链接隔离，不同买方之间绝不会互相看见问题或回复内容；对仅需单向浏览的链接，也可以按需关闭 Q&amp;A 模块。
        </p>

        <div className="my-6">
          <ZoomableImage
            src="/screenshots/feat-vdr-qna.png"
            alt="支持按状态追踪、链接筛选与线程回复的资料室 Q&A 管理后台"
            width={1538}
            height={951}
            className="rounded-lg shadow-lg border border-gray-200"
          />
          <p className="mt-2 text-center text-xs text-gray-500">
            Q&amp;A 管理面板：追踪待回复/已完结问题，并按分享链接筛选问答线索。
          </p>
        </div>

        <h3 className="text-xl font-semibold mt-10 mb-3">3. 品牌定制与容量治理</h3>
        <p className="mb-4">通过资料室设置统一控制外观品牌与资源上限：</p>
        <ul className="list-disc pl-5 space-y-2 mb-4 text-sm text-gray-700">
          <li>
            <strong>横幅 Banner 与主题色：</strong>上传项目 Banner 或轮播图，匹配品牌或交易主题色系。
          </li>
          <li>
            <strong>层级编号索引：</strong>一键开启 <code>1.0</code>、<code>1.1</code>、<code>2.0</code> 式规范索引编号，契合法务与金融尽调目录习惯。
          </li>
          <li>
            <strong>存储空间配额：</strong>为每个资料室设置独立存储配额，精细管理自托管服务器或对象存储成本。
          </li>
        </ul>

        <div className="my-6">
          <ZoomableImage
            src="/screenshots/feat-vdr-settings.png"
            alt="虚拟资料室品牌横幅、存储配额与编号索引设置界面"
            width={1529}
            height={963}
            className="rounded-lg shadow-lg border border-gray-200"
          />
          <p className="mt-2 text-center text-xs text-gray-500">
            资料室设置面板：配置 Banner、主题色、存储配额与文档编号开关。
          </p>
        </div>

        <h3 className="text-xl font-semibold mt-10 mb-3">4. 几分钟搭好目录树</h3>
        <p className="mb-4">
          支持直接导入已有文件夹、批量关联个人文档库或云端存储内容、星标重点文件，以及通过拖拽实时调整目录与文档排序。
        </p>

        <div className="my-6">
          <ZoomableImage
            src="/screenshots/feat-vdr-add-content.png"
            alt="在虚拟资料室中拖拽排序、星标及批量添加文档的操作界面"
            width={1278}
            height={913}
            className="rounded-lg shadow-lg border border-gray-200"
          />
          <p className="mt-2 text-center text-xs text-gray-500">
            资料室目录树：支持拖拽调整顺序、星标重点材料并从本地或已连云盘一键导入。
          </p>
        </div>
      </div>
    ),
  },
  'cloud-storage-integration': {
    name: '现有云盘直连',
    menuName: '现有网盘直连',
    description: '通过标准 OAuth2 安全对接 Google Drive、Dropbox 与私有云 Nextcloud，无需大迁移即可把文件引入安全追踪流。',
    keywords: ['Nextcloud 集成', 'Google Drive 集成', 'Dropbox 导入', 'OAuth2 云盘连接'],
    docsHref: '/zh/help/getting-started',
    docsLabel: '查看使用指南',
    workflowSteps: [
      '授权绑定 Dropbox、Google Drive 或 Nextcloud 账号。',
      '勾选所需文档与文件夹并启动异步后台导入。',
      '导入完成的文档立即具备水印、密码与资料室分发能力。',
      '在同一平台集中追踪所有分发后的下游阅读动态。',
    ],
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">安全绑定常用云端账号</h3>
        <p className="mb-4">
          支持通过标准 OAuth2 协议对接 Dropbox、Google Drive 等公有云盘，以及自托管私有云 Nextcloud，不破坏团队既有的文件存储习惯。
        </p>
        <Image
          src="/screenshots/feat-cloud-import.png"
          alt="连接外部云存储平台并授权导入文件的界面截图"
          width={1200}
          height={750}
          className="my-6 rounded-lg shadow-lg border"
        />

        <h3 className="text-xl font-semibold mb-4">异步后台处理</h3>
        <p>
          勾选大文件或整个目录发起导入后，后台 Worker 会异步完成拉取与预览转换，不会阻塞当前网页操作。
        </p>
        <Image
          src="/screenshots/feat-dropbox.png"
          alt="从 Dropbox 选择并异步导入文件到 Coneshare 的截图"
          width={1200}
          height={750}
          className="my-6 rounded-lg shadow-lg border"
        />
      </div>
    ),
  },
  'workflow-automation-integration': {
    name: '工作流自动化与 Webhook 集成',
    menuName: '企微飞书与 Webhook',
    description: '由文档打开、下载与资料室访问事件实时驱动自动化规则，将告警推送至 Slack、企微/飞书或任意内部 Webhook。',
    keywords: ['文档自动化', 'Webhook 通知', '企微飞书机器人', 'Slack 阅读告警'],
    docsHref: '/zh/help/analytics-and-mcp',
    docsLabel: '查看使用指南',
    workflowSteps: [
      '定义关心的文档交互触发条件与接收目标渠道。',
      'Coneshare 实时捕获外发链接与资料室访问事件。',
      '自动将结构化 JSON Payload 推送至 Slack 或自定义 Webhook。',
      '团队结合重放与失败重试日志保障关键跟进流程稳定运行。',
    ],
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">事件驱动的实时通知</h3>
        <p className="mb-4">
          把文档事件直接映射到业务动作：无论是首次打开、反复浏览还是附件下载，都能实时触发通知到达 Slack 频道、企微/飞书自定义机器人或 CRM Webhook 端点。
        </p>
        <Image
          src="/screenshots/automation-rules.png"
          alt="配置文档阅读事件触发规则与 Webhook 路由的界面截图"
          width={1200}
          height={750}
          className="my-6 rounded-lg shadow-lg border"
        />

        <h3 className="text-xl font-semibold mb-4">可观测的投递日志与重试</h3>
        <p>
          内置投递审计日志、失败自动重试与手动重放（Replay）能力；同一事件流也可同时路由到多个目标端，让不同职能小组同步保持对齐。
        </p>
        <Image
          src="/screenshots/automation-logs.png"
          alt="支持状态查看、失败重试与事件重放的自动化投递日志截图"
          width={1200}
          height={750}
          className="my-6 rounded-lg shadow-lg border"
        />
      </div>
    ),
  },
  'file-requests': {
    name: '安全文件收集 (File Request)',
    menuName: '安全文件收集箱',
    description: '无需对方注册账号，通过专用受控上传链接直接向客户、供应商或合作伙伴收取文件并自动归档至指定目录。',
    keywords: ['文件收集', '大文件接收', '客户资料上传入口', 'File Request'],
    docsHref: '/zh/help/file-requests',
    docsLabel: '查看使用指南',
    workflowSteps: [
      '选定目标文件夹并生成一条 File Request 上传链接。',
      '外部协作者无需登录或注册账号即可直接提交文件。',
      '系统自动记录提交者姓名、邮箱与上传时间戳。',
      '内部团队在原有文档库目录中直接汇总审阅来件。',
    ],
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">简化外部文件收集流程</h3>
        <p className="mb-4">
          针对任意文件夹生成一个独立的安全上传页，外部客户、供应商或候选人点开即可投递大文件，彻底替代容积受限的邮件附件和易过期的临时网盘分享。支持结合{' '}
          <Link href="/zh/features/file-request-embed" className="font-semibold text-gray-900 underline">
            网页嵌入指南
          </Link>{' '}
          以 iframe 方式集成进企业自有客户门户。
        </p>
        <Image
          src="/screenshots/feat-filerequest1.png"
          alt="创建 File Request 安全文件收集链接的配置截图"
          width={1200}
          height={750}
          className="my-6 rounded-lg shadow-lg border"
        />

        <h3 className="text-xl font-semibold mb-4">每一次上传都清晰可追溯</h3>
        <p>
          上传者的姓名与邮箱会自动关联并展示在对应文件旁，避免“收到十几个同名压缩包却不知道谁传的”的混乱。所有收到的文件直接归属在你的目标文件夹下。
        </p>
        <Image
          src="/screenshots/feat-filerequest2.png"
          alt="展示外部上传者信息与文件归档结果的界面截图"
          width={1200}
          height={750}
          className="my-6 rounded-lg shadow-lg border"
        />
      </div>
    ),
  },
  'self-hosted': {
    name: '私有化部署与企业级数据主权',
    menuName: '私有化部署',
    description: '面向看重数据合规与隐私安全的团队设计，完整运行于企业自有服务器或私有云环境中，掌握 100% 数据主权。',
    keywords: ['私有化部署', 'Docker Compose 自托管', '数据合规主权', '内网安全 VDR'],
    docsHref: 'https://docs.coneshare.com/en/quick-start/',
    docsLabel: '查看运维部署文档',
    docsExternal: true,
    workflowSteps: [
      '在企业自有 Linux 服务器或私有云通过 Docker Compose 部署 Coneshare。',
      '在内部配置对象存储、邮件服务、反向代理与访问策略。',
      '所有文档外发、阅读遥测与自动化通知全程留在自有边界内运行。',
      '满足内部安全审计、数据驻留与合规管控要求。',
    ],
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">完整的数据主权掌控</h3>
        <p className="mb-4">
          不强制依赖多租户第三方 SaaS 存储，机密商业材料、客户记录与阅读分析数据全部保留在组织自控基础设施内，助力企业满足严格的数据驻留与合规规范。
        </p>
        <h3 className="text-xl font-semibold mb-4">容器化快速交付</h3>
        <p>
          官方提供开箱即用的 Docker Compose 部署方案与维护脚本，几分钟即可在自有环境中拉起包含在线预览、分析与后台队列在内的完整服务栈。
        </p>
      </div>
    ),
  },
  'online-document-preview': {
    name: '全格式免安装在线预览',
    menuName: '免安装在线预览',
    description: '在任意桌面或移动端浏览器中免安装客户端直接预览 PDF、PPT/Word、Excel 表格、图片与流媒体视频，并支持动态水印。',
    keywords: ['在线文档预览', '免安装浏览 PPT Excel', '在线图片预览', '视频流保护'],
    docsHref: '/zh/help/getting-started',
    docsLabel: '查看使用指南',
    workflowSteps: [
      '上传 PDF、办公文档、表格、图片或视频。',
      'Coneshare 后台 Worker 自动完成高保真网页预览转换与切片处理。',
      '外部访客无需下载即可直接在浏览器内浏览，并受动态水印和权限保护。',
      '按需禁用本地下载，从源头减少未经授权的原始文件扩散。',
    ],
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">无需安装本地软件的通用阅读器</h3>
        <p className="mb-4">
          外部接收方不需要本地安装 Microsoft Office、专用表格软件或播放器。各类文件在主流桌面与手机浏览器中都能流畅渲染，大幅降低对方查看材料的门槛。
        </p>

        <h3 className="text-xl font-semibold mb-4">支持的主流文件格式</h3>
        <p className="mb-4 text-sm text-gray-600">
          针对不同文档类别提供专门优化的网页渲染与保护视图：
        </p>

        <div className="not-prose my-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-gray-50/70 p-5 shadow-sm">
            <div>
              <h4 className="text-base font-bold text-gray-900">PDF 文档</h4>
              <p className="mt-1 text-xs text-gray-600">
                矢量清晰文字渲染、自适应分页浏览，并在每一页画布叠加动态访客水印。
              </p>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <ZoomableImage
                src="/screenshots/preview-pdf.png"
                alt="支持自适应分页的在线 PDF 预览视图"
                width={1292}
                height={737}
                className="w-full h-auto object-cover rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-gray-50/70 p-5 shadow-sm">
            <div>
              <h4 className="text-base font-bold text-gray-900">Word 与演示文稿</h4>
              <p className="mt-1 text-xs text-gray-600">
                高保真还原版式与字体排版，支持幻灯片切换与逐页停留计时。
              </p>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <ZoomableImage
                src="/screenshots/preview-docx.png"
                alt="在线预览 Word 与 PPT 演示文稿截图"
                width={1295}
                height={733}
                className="w-full h-auto object-cover rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-gray-50/70 p-5 shadow-sm">
            <div>
              <h4 className="text-base font-bold text-gray-900">电子表格与财务模型</h4>
              <p className="mt-1 text-xs text-gray-600">
                交互式多 Sheet 切换、计算结果呈现以及冻结窗格保留，无需放行源文件即可在线审阅数据。
              </p>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <ZoomableImage
                src="/screenshots/preview-spreadsheet.png"
                alt="在线查看 Excel 与 CSV 电子表格截图"
                width={1296}
                height={735}
                className="w-full h-auto object-cover rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-gray-50/70 p-5 shadow-sm">
            <div>
              <h4 className="text-base font-bold text-gray-900">高清图片</h4>
              <p className="mt-1 text-xs text-gray-600">
                全面兼容常见桌面与移动端图片格式，由服务端统一优化转码，浏览器内即点即看。
              </p>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <ZoomableImage
                src="/screenshots/preview-image.png"
                alt="高清图片在线预览视图"
                width={1533}
                height={819}
                className="w-full h-auto object-cover rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-gray-50/70 p-5 shadow-sm sm:col-span-2">
            <div>
              <h4 className="text-base font-bold text-gray-900">浏览器流媒体视频播放</h4>
              <p className="mt-1 text-xs text-gray-600">
                内置流媒体播放器用于产品演练、架构分享与客户交付视频，支持受控播放并统计观看完成度。
              </p>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <ZoomableImage
                src="/screenshots/preview-video.png"
                alt="浏览器端受控视频流媒体预览界面"
                width={1376}
                height={761}
                className="w-full h-auto object-cover rounded-lg"
              />
            </div>
          </div>
        </div>

        <h3 className="text-xl font-semibold mb-4">在线预览下的安全与水印防护</h3>
        <p className="mb-4">
          支持在线看图看表格并不意味放弃安全控制。服务端渲染或预览视图可实时叠加访客邮箱与时间水印；若关闭下载开关，接收方可以流畅检视所有页码或工作表，却无法直接提取原始文件。
        </p>

        <h3 className="text-xl font-semibold mb-4">无缝衔接逐页阅读分析</h3>
        <p>
          由于演示文档和 PDF 会按页渲染展示，Coneshare 能够准确记录对方在每一页停留了多少秒，帮助你一眼锁定受众最关心的核心页面。
        </p>
      </div>
    ),
  },
};

export function getLocalizedFeature(feature, locale = 'en') {
  if (!feature) return null;
  if (locale !== 'zh') return feature;
  const zh = FEATURES_ZH[feature.slug];
  if (!zh) return feature;
  return {
    ...feature,
    ...zh,
  };
}
