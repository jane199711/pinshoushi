/**
 * 本地诗歌碎片生成器 —— 完全在浏览器本地运行，不接入任何真实 API / 网络。
 *
 * 取材遵循「拼贴诗 / found poetry」的本意：从现成的印刷文字里剪取词语再重组。
 *
 * ───────────────────────────────────────────────────────────────
 *  词库规则（v2）：词库只有两类
 *    1) 公共词库 COMMON —— 无情绪指向的日常动词 + 所有虚词（副词 / 连词 /
 *       助词·代词·介词·语气词）+ 中性报刊短片段。可跨主题复用。
 *    2) 主题词库 THEME —— 带有情绪与意象的实词（名词 / 形容词 / 动词 /
 *       短片段），按主题模板 + 关系 + 风格 + 情绪组织，区分度高。
 *  「实词 / 虚词」说明：公共词库里的日常动词在语法上属于实词，但语义中性，
 *   归类于「公共」；虚词（副词·连词·助词等）则全部归入公共词库。
 * ───────────────────────────────────────────────────────────────
 *
 *  飘落规则：
 *   · 主题模式（生日 / 纪念日 / 告白 / 感谢 / 想念）：每次落下 = 绝大多数主题词
 *     + 极少量公共词（中性动词 + 虚词）。主题词（用户提供的意象词）约占 90%，主导
 *     意象；公共词约占 10%，仅作连接与节奏。
 *   · 自由模式：提供整个词库（公共 + 全部主题）的随机词，遵循「大部分实词、
 *     少部分虚词」的比例（实词≈80% / 虚词≈20%）。
 *   · 飘落与面板均无空白词条：所有碎片都是可直接拼贴的成词。
 */

import type { Preset, Template, Relation } from "./work-storage";

type PoolPart = Partial<{
  nouns: string[];
  adjectives: string[]; // 统一以「的」结尾（生成时自动补齐）
  verbs: string[];
  imagery: string[]; // 短片段 2-8 字
}>;

/* ================================================================== */
/* 公共词库 COMMON：所有虚词 + 无情绪指向的日常动词 + 中性短片段        */
/* ================================================================== */

export const COMMON = {
  // 真正中性的日常实物名词（无情绪指向，可作公共点缀）
  neutralNouns: [
    "窗", "门", "路", "纸", "信", "灯", "杯", "书", "桌", "椅",
    "碗", "笔", "盒", "绳", "镜",
  ],

  // 无情绪指向的日常动词（实词但语义中性，可跨主题复用）
  dailyVerbs: [
    "打开", "关上", "走过", "停下", "抵达", "出发", "落下", "升起",
    "触碰", "收集", "种下", "收割", "缝补", "擦亮", "折叠", "撕开",
    "翻开", "合上", "路过", "张望", "沉入", "漫过", "停靠", "归来",
    "拾起", "遗落", "剪下", "粘贴", "拼凑", "涂改", "眺望", "点亮",
    "藏进", "拿起", "放下", "推开", "移动", "摆放", "整理", "清洗",
    "晾晒", "书写", "描绘", "摇晃", "漂浮", "转动", "穿过", "越过",
    "绕过", "跟随", "离开", "靠近", "退后", "站定", "坐下", "躺下",
    "醒来", "睡去", "呼吸", "听见", "看见", "望见", "奔跑", "行走",
    "站立", "转身", "回头",
    // 扩充：更多中性日常动词
    "等待", "寻找", "发现", "记住", "忘记", "想起", "认出", "呼唤",
    "答应", "接受", "给出", "收回", "保留", "丢掉", "捡起", "捧起",
    "握住", "松开", "抚摸", "敲击", "弹奏", "哼唱", "低语", "诉说",
    "倾听", "回答", "凝视", "注视", "仰望", "俯瞰", "环顾", "寻觅",
    "追逐", "迎接", "送别", "相聚", "分散", "汇合", "分开", "连接",
  ],

  // 虚词 · 副词
  adverbs: [
    "忽然", "静静", "终于", "缓缓", "偶尔", "始终", "渐渐", "恰好",
    "依然", "慢慢", "常常", "又", "悄悄", "独自", "刚好", "一再",
    "正在", "一直", "已经", "还", "也", "都", "只", "才", "就",
    "在", "从", "向", "朝", "沿着", "穿过", "越过", "绕过",
    "忽然间", "不知不觉", "轻轻地", "缓缓地", "默默地", "深深地",
    "紧紧地", "久久地", "再一次", "一遍又一遍", "蓦然", "恍然",
  ],

  // 虚词 · 连词
  conjunctions: [
    "而是", "尽管", "于是", "以及", "然后", "却又", "因为", "如果",
    "只要", "哪怕", "可是", "但是", "不过", "然而", "所以", "因此",
    "或者", "或是", "不仅", "而且", "既然", "除非", "无论", "不管",
    "即使", "纵使", "于是便", "哪怕只是", "就算", "倘若", "假如",
  ],

  // 虚词 · 助词 · 代词 · 介词 · 语气词
  particles: [
    "你", "你们", "我", "我们", "他", "他们", "她", "它", "它们",
    "着", "了", "的", "之", "把", "彼此", "被", "让", "给", "替", "为",
    "而", "与", "地", "得", "过",
    "这", "那", "这儿", "那儿", "哪里", "谁", "什么", "怎么",
    "自己", "大家", "有人", "没人", "人人", "处处", "时时",
    "似的", "般", "一样", "一般", "吧", "呢", "吗", "啊", "呀",
    "罢", "罢了", "而已",
  ],

  // 中性报刊 / 日常短片段（无情绪指向，公共池）
  imagery: [
    "在人间", "向着远方", "以及夜晚", "一整个下午", "第几页",
    "很多年以后", "天气预报",
  ],
};

/* ================================================================== */
/* 主题词库 THEME：按主题模板组织（含用户提供的扩充词）                 */
/* ================================================================== */

const TEMPLATE_POOLS: Record<Template, PoolPart> = {
  // ── 生日 · 骆一禾：沉毅炽热，歌颂生命、光与火 ──────────
  birthday: {
    nouns: [
      "烛光", "年轮", "星辰", "蛋糕", "蜡烛", "时光", "礼物", "晨曦",
      "羽翼", "起点", "篇章", "花期", "暖阳", "甜梦", "糖果", "气球",
      "祝福", "笑靥", "拥抱", "旋律", "生长", "光芒", "初雪", "春天",
      "童话", "风铃", "彩虹", "蜜糖", "繁星", "岁月", "旅途", "破晓",
      "花火", "序曲", "心跳", "温度", "纪念", "诗行", "翅膀", "礼物盒",
      "琥珀", "麦田", "晴空", "岛屿", "云朵", "柚子", "甜橙", "向日葵",
      // 骆一禾风格增补：火 / 光 / 生命 / 壮烈
      "火焰", "光辉", "烈火", "星火", "薪火", "炬火", "黎明", "青春",
      "飞翔", "壮烈", "辽阔", "岩石", "地衣", "工蜂", "大地", "血",
      "山岳", "旷野", "苍穹", "雄鹰", "激流", "江河", "初生", "诞生",
      "燃烧", "照耀", "生命", "耕耘", "篝火", "朝霞", "行列", "远方",
    ],
    adjectives: ["甜", "新", "暖", "明亮", "柔软", "炽热", "滚烫", "壮烈", "辽阔", "年轻", "沸腾", "皎洁", "沉毅", "庄严"],
    verbs: ["许愿", "绽放", "燃烧", "照耀", "飞翔", "诞生", "迸发", "升腾", "奔腾", "怒放", "歌颂", "赞美", "点燃", "喷射", "照亮"],
    imagery: [
      "又长大一岁", "烛火里", "写在贺卡上", "第一支蜡烛", "把年岁轻轻",
      "壮丽的日子", "年轻的血", "初升的太阳", "不息的火", "修远的路",
      "大地的光", "还在燃烧", "放出光辉", "生命的火", "生日快乐",
    ],
  },

  // ── 纪念日 · 张枣：平静含蓄，时间在流淌中捕捉永恒 ────
  anniversary: {
    nouns: [
      "回忆", "琥珀", "烙印", "相框", "老照片", "胶片", "年轮", "纪念册",
      "钟声", "沙漏", "足迹", "誓言", "永恒", "星辰", "海浪", "贝壳",
      "漂流瓶", "信物", "那一天", "初见", "回眸", "牵手", "温度", "玫瑰",
      "月光", "红酒", "烛光", "旧唱片", "旋律", "舞步", "笑容", "泪水",
      "珍藏", "封存", "日历", "铭心", "温柔", "岁月", "流金", "灯塔",
      "海岸线", "锚", "船", "岛屿", "潮汐", "落日", "霞光", "诗篇",
      // 张枣风格增补：镜 / 雨 / 时间 / 古典意蕴
      "镜", "梅花", "南山", "雨", "气温", "桌子", "信", "苹果", "蝴蝶",
      "黄昏", "怀念", "时间", "尘埃", "灯芯绒", "舞蹈", "皇帝", "传统",
      "江南", "窗", "钟", "茶杯", "书页", "影", "水", "秋", "清晨", "露",
      "镜中", "信笺", "故园", "燕子", "雪", "月",
    ],
    adjectives: ["永恒", "温柔", "流金", "漫长", "泛旧", "清澈", "芬芳", "寂静", "淡淡", "温润", "悠远", "澄明", "古典", "轻柔", "幽微"],
    verbs: ["铭刻", "牵手", "珍藏", "封存", "想念", "重复", "凝视", "落满", "浸染", "流淌", "回望", "映照", "轻触", "翻开", "等待", "栖息"],
    imagery: [
      "又一年", "同一天", "旧照片里", "并肩走过", "日历翻到",
      "同样的一天", "零星小雨", "落满南山", "镜中的你", "梅花的雪",
      "秋日的信", "安静的午后", "时间的河", "轻轻翻开", "落满尘埃", "重复气温",
    ],
  },

  // ── 告白 · 舒婷：独立而深刻的爱情宣言，平等、并肩 ────
  confession: {
    nouns: [
      "心跳", "玫瑰", "月光", "情书", "目光", "微风", "细雨", "彩虹",
      "星辰", "大海", "誓言", "永远", "掌纹", "温度", "唇印", "花火",
      "悸动", "暗涌", "潮水", "阳光", "秘密", "名字", "诗", "歌唱",
      "翅膀", "光", "影", "晨曦", "黄昏", "初雪", "花开", "甜蜜",
      "柔软", "拥抱", "亲吻", "执手", "余生", "风景", "旅途", "港湾",
      "灯火", "窗口", "信笺", "邮箱", "那一句", "勇敢", "契合", "灵魂",
      // 舒婷风格增补：橡树 / 木棉 / 根叶 / 并肩
      "橡树", "木棉", "根", "叶", "鸟儿", "险峰", "泉源", "日光", "春雨",
      "铜枝铁干", "红硕的花朵", "叹息", "火炬", "寒潮", "风雷", "霹雳",
      "雾霭", "云霞", "虹霓", "并肩", "相依", "坚贞", "土地", "船", "桅",
      "灯塔", "海岸", "树", "身影", "致意",
    ],
    adjectives: ["羞涩", "甜蜜", "柔软", "勇敢", "契合", "坚贞", "英勇", "沉重", "伟岸", "温柔", "赤诚", "平等", "相依", "葱茏", "圣洁"],
    verbs: ["绽放", "花开", "拥抱", "亲吻", "执手", "歌唱", "站立", "紧握", "相触", "分担", "共享", "致意", "照耀", "依偎", "托起", "守望"],
    imagery: [
      "说不出口", "在你耳边", "月色里", "偷偷写下", "关于喜欢", "那一句",
      "作为树的形象", "紧握在地下", "相触在云里", "分担寒潮", "共享虹霓",
      "伟岸的身躯", "脚下的土地", "近旁的一株", "永远分离", "终生相依",
    ],
  },

  // ── 感谢 · 汪国真：温暖真挚、朗朗上口、富含哲理 ──────
  thanks: {
    nouns: [
      "暖阳", "港湾", "春风", "细雨", "灯塔", "星辰", "大地", "树根",
      "泉水", "炉火", "拥抱", "微笑", "眼泪", "手", "肩膀", "陪伴",
      "支撑", "光芒", "种子", "花开", "果实", "麦田", "收获", "馈赠",
      "礼物", "诗篇", "颂歌", "烛光", "月光", "晨光", "引路", "渡口",
      "桥", "伞", "屋檐", "热茶", "粥", "灯火", "无声", "懂得", "慈悲",
      "柔软", "坚强", "同在", "并肩", "同行", "分担", "倾听", "存在", "谢谢",
      // 汪国真风格增补：远方 / 风雨 / 地平线 / 背影
      "远方", "风雨", "地平线", "背影", "大海", "山路", "山峰", "河流",
      "草原", "朝霞", "黎明", "脚步", "热爱", "梦想", "希望", "星光",
      "云霞", "秋叶", "夏花", "旅程", "季节", "光荣", "快乐", "幸福",
    ],
    adjectives: ["柔软", "坚强", "慈悲", "温暖", "踏实", "辽阔", "从容", "明朗", "坦荡", "慷慨", "潇洒", "平凡", "热忱", "温厚", "真诚", "淳厚"],
    verbs: ["陪伴", "支撑", "引路", "同在", "并肩", "同行", "分担", "倾听", "走向", "热爱", "感谢", "回报", "给予", "获得", "向往", "追寻", "启程", "跋涉", "珍惜", "感恩"],
    imagery: [
      "谢谢你", "在身边", "那些日子", "替我", "一直都在",
      "走向远方", "风雨兼程", "热爱生命", "假如快乐", "只要明天",
      "不够快乐", "从容地", "平凡却珍贵", "一缕春风", "整个春天", "让我怎样感谢你",
    ],
  },

  // ── 想念 · 郑愁予：意象鲜明，岛与海，古典与现代交融 ──
  missing: {
    nouns: [
      "月光", "信笺", "远方", "风铃", "旧照片", "梦境", "回声", "潮汐",
      "海岸", "飞鸟", "云朵", "雨丝", "落叶", "窗台", "灯火", "空椅",
      "茶杯", "余温", "气息", "名字", "笔画", "诗行", "旋律", "旧歌",
      "磁带", "黄昏", "晨曦", "星空", "孤岛", "漂流瓶", "藤蔓", "荒原",
      "野花", "雾", "霜", "雪", "归途", "车票", "站台", "行囊", "目光",
      "背影", "声音", "笑涡", "指纹", "枕边", "呢喃", "辗转", "无眠", "距离",
      // 郑愁予风格增补：岛 / 江南 / 马蹄 / 过客
      "岛", "江南", "莲花", "东风", "柳絮", "青石的街道", "窗扉", "马蹄",
      "过客", "归人", "夜", "山", "平芜", "云", "泉水", "海洋", "萤火虫",
      "笛", "小羊", "牧童", "午寐", "浪子", "寂寞的城", "驿站", "柳",
      "跫音", "春帷", "夕阳", "江湖",
    ],
    adjectives: ["遥远", "空落", "未寄", "寂寞", "小小", "青青", "蓝", "绿", "徐徐", "轻轻", "郁郁"],
    verbs: ["辗转", "呢喃", "无眠", "思念", "栖息", "凝望", "披垂", "等待", "点灯", "化做", "踏着", "展开", "退去"],
    imagery: [
      "隔着山海", "写给远方", "在夜里", "还没寄出", "山那边",
      "小小的岛", "美丽的错误", "不是归人", "是个过客", "青石的街道",
      "小小的城", "达达的马蹄", "青青的国度", "你住的小小的岛", "以我的一生为你点盏灯", "等你，在季节里",
    ],
  },

  // ── 自由 · 穆旦：思辨而坦诚，肯定肉体、自由与生命 ──
  // 注：此模板原为「无主题全库」模式，现定为「自由」主题（穆旦），
  // 因此不再是空池，改为真正的主题词库；无主题混合模式仅在 preset 无 template 时触发。
  free: {
    nouns: [
      "肉体", "自由", "丰富", "混沌", "自然", "血", "土地", "光", "黑夜",
      "春天", "火焰", "摇曳", "渴求", "反抗", "烦恼", "欢乐", "赤裸",
      "理智", "感情", "风暴", "旷野", "冰雪", "冬天", "新生", "赞美",
      "拥抱", "挣扎", "野花", "死亡", "再生", "身体", "灵魂", "星空",
      "雷电", "大海", "山峰", "新生",
    ],
    adjectives: ["自由", "丰富", "赤裸", "新鲜", "真实", "丰盈", "庄严", "战栗", "坦荡", "光明"],
    verbs: ["歌颂", "溶进", "肯定", "颤动", "渴望", "反抗", "拥抱", "挣扎", "新生", "赞美", "飞翔", "燃烧", "绽放", "挣脱"],
    imagery: [
      "歌颂肉体", "自由而丰富", "光影视色", "赤裸的世界", "绿色的火焰",
      "摇曳的春天", "带血的手", "生命的火", "挣脱束缚", "风暴中的新生",
    ],
  },
};

/* ================================================================== */
/* 主题推荐诗人（研究记录）：用户为 6 个主题各推荐一位诗人，        */
/* 词库风格即据此 6 位诗人的代表作与语感扩充。                       */
/* ================================================================== */

export const POET_THEMES: Record<Template, { poet: string; school: string; signature: string; poems: string[] }> = {
  thanks: {
    poet: "汪国真",
    school: "当代 · 清新哲理",
    signature: "《感谢》",
    poems: [
      "热爱生命", "山高路远", "旅程", "我微笑着走向生活", "让我怎样感谢你",
      "假如你不够快乐", "跨越自己", "挡不住的青春", "只要明天还在", "我不期望回报",
      "走向远方", "雨的随想", "剪不断的情愫", "嫁给幸福", "怀想", "默默的情怀",
      "给我一个微笑就够了", "思念", "背影", "只要彼此爱过一次", "祝你好运", "许诺",
    ],
  },
  birthday: {
    poet: "骆一禾",
    school: "朦胧诗之后 · 沉毅炽热",
    signature: "《生日》",
    poems: [
      "生日", "先锋", "修远", "为美而想", "大河", "黄昏", "春之祭",
      "辽阔胸怀", "壮烈风景", "屋宇", "太阳日记", "黑豹", "女神", "五月的鲜花",
      "灿烂平息", "飞行", "春天", "世界的血", "大海", "普罗米修斯",
    ],
  },
  anniversary: {
    poet: "张枣",
    school: "先锋诗歌 · 古典现代交融",
    signature: "《纪念日》",
    poems: [
      "镜中", "何人斯", "十月之水", "祖母", "灯芯绒幸福的舞蹈", "椅子坐进冬天",
      "早晨的风暴", "悠悠", "木兰树", "天鹅", "楚王梦雨", "罗蜜欧与朱丽叶",
      "梁山伯与祝英台", "爱尔莎和隐名骑士", "丽达与天鹅", "吴刚的怨诉", "空白练习曲", "云", "鹤",
    ],
  },
  confession: {
    poet: "舒婷",
    school: "朦胧诗派",
    signature: "《致橡树》",
    poems: [
      "致橡树", "祖国啊，我亲爱的祖国", "神女峰", "双桅船", "思念", "雨别",
      "这也是一切", "啊，母亲", "惠安女子", "会唱歌的鸢尾花", "日光岩下的三角梅",
      "也许", "赠别", "秋夜送友", "初春", "人心的法则", "珠贝——大海的眼泪",
      "在潮湿的小站上", "北京深秋的晚上", "墙", "馈赠",
    ],
  },
  missing: {
    poet: "郑愁予",
    school: "浪子诗人 · 古典现代交融",
    signature: "《小小的岛》",
    poems: [
      "错误", "小小的岛", "赋别", "水手刀", "如雾起时", "残堡", "情妇",
      "野店", "梦土上", "天窗", "雨丝", "归航曲", "山外书", "边界酒店",
      "牧羊女", "旅程", "妾", "午夜的微雨", "草生", "左营", "南湖居", "渡",
    ],
  },
  free: {
    poet: "穆旦",
    school: "九叶诗派 · 现代主义思辨",
    signature: "《我歌颂肉体》",
    poems: [
      "赞美", "诗八首", "我歌颂肉体", "春", "旗", "森林之魅", "在旷野上",
      "五月", "草原上", "玫瑰之歌", "夜晚的告别", "裂纹", "智慧的来临", "给战士",
      "探险队", "在寒冷的腊月的夜里", "黄昏", "冬夜", "玫瑰的故事", "秋", "自己",
      "自然底梦", "他们死去了", "夏", "赠别", "还原作用", "被围者", "隐现", "活下去",
    ],
  },
};

/* ================================================================== */
/* 关系池：按"送给谁"追加专属味道（归入主题词库）                       */
/* ================================================================== */

const RELATION_POOLS: Record<Relation, PoolPart> = {
  lover: {
    nouns: ["心上人", "拥抱", "十指", "情话", "眉眼"],
    adjectives: ["缠绵的"],
    imagery: ["余生", "共度", "枕边"],
  },
  friend: {
    nouns: ["老友", "并肩", "江湖", "旧交", "干杯"],
    adjectives: [],
    imagery: ["很多年", "同行"],
  },
  family: {
    nouns: ["家", "灯火", "团圆", "饭香", "门廊"],
    adjectives: ["温热的"],
    imagery: ["回家", "灯还亮着", "饭桌上"],
  },
  self: {
    nouns: ["自己", "独处", "镜中", "留白"],
    adjectives: ["松弛的"],
    imagery: ["给自己", "慢一点", "独处时"],
  },
  other: {
    nouns: ["心意", "牵挂"],
    adjectives: ["珍重的"],
    imagery: ["给你", "珍重"],
  },
};

/* ================================================================== */
/* 风格池（7 种）：主要影响形容词与少量名词（归入主题词库）             */
/* ================================================================== */

const STYLE_POOLS: Record<string, PoolPart> = {
  清新: { adjectives: ["清澈的", "湿润的"], nouns: ["晨露", "草木", "柠檬"] },
  忧郁: { adjectives: ["灰蓝的", "阴郁的", "潮润的"], nouns: ["雨季", "深夜", "苔痕"] },
  温柔: { adjectives: ["柔软的", "温软的"], nouns: ["棉花", "掌心", "月色"] },
  俏皮: { adjectives: ["轻快的", "顽皮的"], nouns: ["口哨", "弹珠", "跳格子"] },
  复古: { adjectives: ["泛黄的", "做旧的", "陈旧的"], nouns: ["留声机", "邮戳", "胶片", "旧报纸"] },
  轻盈: { adjectives: ["飘忽的", "蓬松的"], nouns: ["羽毛", "蒲公英", "云絮"] },
  热烈: { adjectives: ["滚烫的", "炽热的"], nouns: ["火焰", "盛夏", "骄阳"] },
};

/* ================================================================== */
/* 情绪池（8 种）：影响形容词与短片段（归入主题词库）                   */
/* ================================================================== */

const MOOD_POOLS: Record<string, PoolPart> = {
  想念: { adjectives: ["绵长的"], imagery: ["想你", "在远方"] },
  温柔: { adjectives: ["温软的"], imagery: ["轻一点", "落进梦里"] },
  怅然: { adjectives: ["怅惘的"], imagery: ["散在风里", "说不清"] },
  雀跃: { adjectives: ["雀跃的"], imagery: ["蹦跳着", "藏不住的"] },
  感激: { adjectives: ["感念的"], imagery: ["谢谢", "记在心里"] },
  释然: { adjectives: ["释然的"], imagery: ["放下了", "笑着告别"] },
  浪漫: { adjectives: ["浪漫的"], imagery: ["月色刚好", "为你"] },
  悸动: { adjectives: ["悸动的"], imagery: ["漏了一拍", "心里一动"] },
};

/* ================================================================== */
/* 类型与工具函数                                                     */
/* ================================================================== */

export type FragmentBucket = "theme" | "common";
export type Fragment = { text: string; bucket: FragmentBucket };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从 pool 里取 n 个未被使用过的词，取完即加入 used（全局去重） */
function take(pool: string[] | undefined, n: number, used: Set<string>): string[] {
  if (!pool || n <= 0) return [];
  const out: string[] = [];
  for (const w of shuffle(pool)) {
    const t = w.trim();
    if (!t || used.has(t)) continue;
    used.add(t);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

function gather(key: keyof PoolPart, parts: (PoolPart | undefined)[]): string[] {
  return parts.flatMap((p) => (p ? p[key] ?? [] : []));
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function normalizeAdj(w: string): string {
  const t = w.trim();
  return t.endsWith("的") ? t : `${t}的`;
}

const fc = (text: string, bucket: FragmentBucket): Fragment => ({ text, bucket });

/** 导出某主题的全部主题词（名词 + 形容词 + 动词 + 短片段），供「一键生成」面板做牌堆轮换 */
export function getAllThemeWords(template: Template): string[] {
  const tpl = TEMPLATE_POOLS[template];
  if (!tpl) return [];
  return uniq([
    ...(tpl.nouns ?? []),
    ...(tpl.adjectives ?? []).map(normalizeAdj),
    ...(tpl.verbs ?? []),
    ...(tpl.imagery ?? []),
  ]);
}

/** 合并所有主题（生日/纪念日/告白/感谢/想念）的全部用户主题词，供自由模式或飘落大池使用 */
export function getAllThemeWordsForAll(): string[] {
  return uniq(
    Object.keys(TEMPLATE_POOLS)
      .filter((t) => t !== "free")
      .flatMap((t) => getAllThemeWords(t as Template)),
  );
}

/** 按词性分类导出主题词，供飘落层按比例取词（名词/形容词/动词/短片段分开） */
export function getThemeWordsByCategory(template: Template | "all"): {
  nouns: string[];
  adjectives: string[];
  verbs: string[];
  imagery: string[];
} {
  const keys = template === "all"
    ? Object.keys(TEMPLATE_POOLS).filter((t) => t !== "free")
    : [template];
  const tpls = keys.map((k) => TEMPLATE_POOLS[k as Template]).filter(Boolean);
  return {
    nouns: uniq(tpls.flatMap((t) => t.nouns ?? [])),
    adjectives: uniq(tpls.flatMap((t) => t.adjectives ?? []).map(normalizeAdj)),
    verbs: uniq(tpls.flatMap((t) => t.verbs ?? [])),
    imagery: uniq(tpls.flatMap((t) => t.imagery ?? [])),
  };
}

/* ================================================================== */
/* 主函数：生成一组诗歌碎片（含桶标记）                               */
/* ================================================================== */

/**
 * 生成一组诗歌碎片。
 *  返回 Fragment[]，每个元素带 bucket 标记：
 *   · theme  —— 主题词（带情绪/意象的实词）
 *   · common —— 公共词（中性日常动词 + 虚词）
 *
 *  opts.themeWordsOverride：若提供，则主题词直接使用该列表（已去重），
 *  用于「一键生成」面板按牌堆轮换、避免同主题重复用词。
 *
 * 主题模式：绝大多数主题词 + 少量公共词。
 * 自由模式：整个词库随机，大部分实词 + 少部分虚词。
 */
export function generateLocalFragments(
  preset?: Preset | null,
  opts?: { themeWordsOverride?: string[] },
): Fragment[] {
  const tpl = preset?.template ? TEMPLATE_POOLS[preset.template] : undefined;
  const relp = preset?.relation ? RELATION_POOLS[preset.relation] : undefined;
  const stylePools = (preset?.style ?? []).map((s) => STYLE_POOLS[s]).filter(Boolean);
  const moodPools = (preset?.moods ?? []).map((m) => MOOD_POOLS[m]).filter(Boolean);

  // 无主题混合模式：仅在 preset 完全未选主题时触发（此时混合全部 5 个真实主题）。
  // 「自由」(free) 现已是穆旦风格的主题词库，不再视为无主题。
  const isFree = !preset?.template;

  // 公共词库：中性日常动词 + 所有虚词（不含旧报刊/中性短片段，避免污染主题桶）
  const commonDailyVerbs = COMMON.dailyVerbs;
  const commonFunc = [
    ...COMMON.adverbs,
    ...COMMON.conjunctions,
    ...COMMON.particles,
  ];

  const used = new Set<string>();
  const out: Fragment[] = [];

  if (isFree) {
    // 自由创作：整个词库随机，但只用「用户新词库主题词」+ 可选风格/情绪/关系点缀 + 公共虚词
    const contentPool = uniq([
      ...getAllThemeWordsForAll(),            // 五主题用户新词全集（绝对主干）
      ...gather("nouns", stylePools),
      ...gather("adjectives", stylePools),
      ...gather("verbs", stylePools),
      ...gather("imagery", stylePools),
      ...gather("nouns", moodPools),
      ...gather("adjectives", moodPools),
      ...gather("imagery", moodPools),
      ...(relp ? [...(relp.nouns ?? []), ...(relp.adjectives ?? []), ...(relp.imagery ?? [])] : []),
    ]);
    const funcPool = commonFunc;

    // 实词（用户新词）≈ 80%，虚词（公共）≈ 20%
    out.push(...take(contentPool, 36, used).map((t) => fc(t, "theme")));
    out.push(...take(funcPool, 8, used).map((t) => fc(t, "common")));
    return shuffle(out);
  }

  // 主题模式：主题词（主导意象）+ 极少量公共词（中性动词 + 虚词）
  // ——「一键生成」面板若传入 themeWordsOverride，则直接用该列表作为主题词（已按牌堆去重）
  if (opts?.themeWordsOverride?.length) {
    const themeWords = shuffle(uniq(opts.themeWordsOverride));
    for (const w of themeWords) used.add(w.trim());
    out.push(...themeWords.map((t) => fc(t, "theme")));
    // 公共词仅作少量连接（约占 10%）
    out.push(...take(commonDailyVerbs, 3, used).map((t) => fc(t, "common")));
    out.push(...take(commonFunc, 2, used).map((t) => fc(t, "common")));
    return shuffle(out);
  }

  const themeNouns = uniq([
    ...(tpl?.nouns ?? []),
    ...gather("nouns", stylePools),
    ...gather("nouns", moodPools),
    ...(relp?.nouns ?? []),
  ]);
  const themeAdj = uniq([
    ...(tpl?.adjectives ?? []),
    ...gather("adjectives", stylePools),
    ...gather("adjectives", moodPools),
    ...(relp?.adjectives ?? []),
  ]).map(normalizeAdj);
  const themeVerbs = uniq([...(tpl?.verbs ?? []), ...(relp?.verbs ?? [])]);
  const themeImagery = uniq([
    ...(tpl?.imagery ?? []),
    ...gather("imagery", moodPools),
    ...(relp?.imagery ?? []),
  ]);

  // 主题词（用户提供的意象词）占绝对多数：合并后洗匀、尽量全量覆盖，杜绝旧词污染
  const themeWords = shuffle(uniq([
    ...themeNouns,
    ...themeAdj,
    ...themeVerbs,
    ...themeImagery,
  ]));

  // 用户新词占绝大多数（≈92%），公共词仅占少量连接
  out.push(...themeWords.map((t) => fc(t, "theme")));
  out.push(...take(commonDailyVerbs, 3, used).map((t) => fc(t, "common")));
  out.push(...take(commonFunc, 2, used).map((t) => fc(t, "common")));

  return shuffle(out);
}

/* ================================================================== */
/* 一键成诗：按简单汉语语法组句，返回若干"诗行"（每行是若干词块）      */
/* ================================================================== */

const PRONOUNS = ["你", "我", "我们", "他们", "彼此"];

/** 精选的、读起来自然的日常动词（作诗歌连接，仅少量混入，避免喧宾夺主） */
const DAILY_VERBS_POETIC = [
  "打开", "关上", "走过", "抵达", "落下", "升起", "触碰", "收集", "种下",
  "翻开", "合上", "停靠", "归来", "拾起", "点亮", "藏进", "推开", "穿过",
  "靠近", "转身", "望见", "听见", "生长", "绽放",
];

/**
 * 动词及物性分类（用于保证成句通顺、通俗易懂）。
 *  · TRANSITIVE   —— 及物，可带宾语，用于「名词+动词+名词 / 我+动词+名词」
 *  · INTRANSITIVE —— 不及物，不带宾语，用于「名词+动词+了 / 形容词+名词+动词」
 * 这样直接拼接就能得到语法正确、读起来自然的中文短句，不再依赖「词性互通 / 转品」。
 */
const TRANSITIVE = new Set<string>([
  "许愿", "点燃", "照亮", "喷射", "铭刻", "牵手", "珍藏", "封存", "想念", "重复",
  "凝视", "轻触", "翻开", "等待", "拥抱", "亲吻", "执手", "紧握", "分担", "共享",
  "致意", "托起", "守望", "陪伴", "支撑", "引路", "同在", "并肩", "同行", "倾听",
  "走向", "热爱", "感谢", "回报", "给予", "获得", "向往", "追寻", "启程", "跋涉",
  "珍惜", "感恩", "思念", "凝望", "点灯", "化做", "踏着", "展开", "歌颂", "溶进",
  "肯定", "颤动", "渴望", "反抗", "挣扎", "赞美", "挣脱", "打开", "关上", "走过",
  "抵达", "触碰", "收集", "种下", "合上", "停靠", "拾起", "点亮", "藏进", "推开",
  "穿过", "靠近", "转身", "望见", "听见", "收进", "放进", "写下", "留下", "记住",
]);
const INTRANSITIVE = new Set<string>([
  "绽放", "燃烧", "照耀", "飞翔", "诞生", "迸发", "升腾", "奔腾", "怒放", "归来",
  "生长", "盛开", "呼吸", "流淌", "回望", "映照", "栖息", "辗转", "呢喃", "无眠",
  "披垂", "退去", "花开", "站立", "相触", "依偎", "新生", "落下", "升起", "振颤",
  "沉睡", "苏醒", "闪烁", "摇曳", "漫过", "沉入", "飘散", "消散",
]);

/** 按类别构建合并词库（主题/关系/风格/情绪优先，公共池兜底） */
function buildCats(preset?: Preset | null) {
  // 注意：TEMPLATE_POOLS.free 是 {}（truthy 空对象），不能直接用 truthy 判断，
  // 否则 free 模式下 tpl={} 会走到 [{}] 分支，导致名词池为空、只剩关系词。
  const tplKey = preset?.template;
  // 「自由」(free) 现为穆旦风格主题词库，与其它主题同等处理
  const tpl = tplKey ? TEMPLATE_POOLS[tplKey] : undefined;
  const relp = preset?.relation ? RELATION_POOLS[preset.relation] : undefined;
  const stylePools = (preset?.style ?? []).map((s) => STYLE_POOLS[s]).filter(Boolean);
  const moodPools = (preset?.moods ?? []).map((m) => MOOD_POOLS[m]).filter(Boolean);

  // free 模式（未选主题）：合并全部主题词库，保证成诗也以用户新词为主干
  const tpls = tpl ? [tpl] : Object.values(TEMPLATE_POOLS).filter((t) => t && (t.nouns?.length || t.adjectives?.length));

  // 名词 / 形容词 / 动词 / 短片段：来自「用户新词库主题词」+ 可选风格/情绪/关系点缀
  const catOf = (k: keyof PoolPart): string[] =>
    uniq([
      ...tpls.flatMap((t) => t[k] ?? []),
      ...gather(k, stylePools),
      ...gather(k, moodPools),
      ...(relp?.[k] ?? []),
    ]);

  const allVerbs = uniq([
    ...tpls.flatMap((t) => t.verbs ?? []),
    ...(relp?.verbs ?? []),
    ...DAILY_VERBS_POETIC,
  ]);
  // 按及物性拆分，保证成句通顺；若某类为空则用全集兜底
  const transVerbs = allVerbs.filter((v) => TRANSITIVE.has(v));
  const intransVerbs = allVerbs.filter((v) => INTRANSITIVE.has(v));
  const transPool = transVerbs.length ? transVerbs : Array.from(TRANSITIVE);
  const intransPool = intransVerbs.length ? intransVerbs : Array.from(INTRANSITIVE);

  // 词性净化：名词池里可能混入了形容词 / 动词（早期「词性互通 / 转品」残留，
  // 例如 free 的 nouns 含「丰富 / 真实」、confession 含「柔软 / 勇敢」）。
  // 这里把形容词词干和动词从名词池中剔除，确保 noun() 只取到真正的名词，
  // 避免「光在丰富升起」「温柔的柔软」这类不通组合，诗句才通俗易懂。
  const adjStems = new Set(
    uniq([
      ...tpls.flatMap((t) => t.adjectives ?? []),
      ...gather("adjectives", stylePools),
      ...gather("adjectives", moodPools),
      ...(relp?.adjectives ?? []),
    ]).map((w) => w.replace(/的$/, "")),
  );
  const verbSet = new Set<string>([
    ...allVerbs,
    ...Array.from(TRANSITIVE),
    ...Array.from(INTRANSITIVE),
  ]);
  const stripDe = (w: string) => w.replace(/的$/, "");
  const nouns = uniq([
    ...tpls.flatMap((t) => t.nouns ?? []),
    ...gather("nouns", stylePools),
    ...gather("nouns", moodPools),
    ...(relp?.nouns ?? []),
  ]).filter((w) => !adjStems.has(stripDe(w)) && !verbSet.has(w));

  return {
    nouns,
    adjectives: catOf("adjectives").map(normalizeAdj),
    verbs: allVerbs,
    transVerbs: transPool,
    intransVerbs: intransPool,
    adverbs: COMMON.adverbs.slice(),
    conjunctions: COMMON.conjunctions.slice(),
    pronouns: PRONOUNS.slice(),
    imagery: uniq([
      ...tpls.flatMap((t) => t.imagery ?? []),
      ...gather("imagery", moodPools),
      ...(relp?.imagery ?? []),
    ]),
  };
}

/** 取一个未用过的词，偏向词库前部（主题词），带轻随机 */
function pickFrom(arr: string[], used: Set<string>): string {
  const avail = arr.filter((w) => !used.has(w));
  if (!avail.length) return "";
  const w = avail[Math.floor(Math.random() * Math.min(avail.length, 6))];
  used.add(w);
  return w;
}

function rand<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

/**
 * 生成一首"可拼贴"的短诗：返回若干诗行，每行是若干词块。
 *
 * 设计原则（重写于 v3，彻底去掉「词性互通 / 转品」）：
 *  · 语义通顺、通俗易懂——每行都是语法正确、读起来自然的中文短句
 *  · 动词按及物 / 不及物拆分：及物用于「名词+动词+名词 / 我+动词+名词」，
 *    不及物用于「名词+动词+了 / 形容词+名词+动词」，直接拼接即通顺
 *  · 名词为意象骨干、形容词作修饰、虚词适量自然嵌入，不做生硬拼贴
 */
export function generateLocalPoem(preset?: Preset | null): string[][] {
  const c = buildCats(preset);
  const used = new Set<string>();
  const pk = (arr: string[]) => pickFrom(arr, used);

  // ─── 取词器：仅来自「用户新词库主题词」（名词/形容词/动词/短片段）+ 公共虚词 ───
  const noun = () => pk(c.nouns);         // 主题名词：烛光、星辰、蛋糕、许愿…
  const padj = () => pk(c.adjectives);     // 主题形容词：甜的、温暖的、柔软的…
  const verb = () => pk(c.verbs);         // 全部动词（兜底）
  const tverb = () => pk(c.transVerbs);   // 及物动词：照亮、珍藏、拥抱、想念…
  const iverb = () => pk(c.intransVerbs); // 不及物动词：绽放、燃烧、飞翔、升起…
  const img = () => pk(c.imagery);        // 主题短片段：又长大一岁、写在贺卡上…
  const adv = () => pk(c.adverbs);         // 副词：忽然、终于、悄悄…
  const conj = () => pk(c.conjunctions);   // 连词：如果、可是、于是…

  // ══════════════════════════════════════════
  // 六行结构：以用户新词为主题主干，公共虚词自然嵌合（不再使用旧单音节/宏大意象词）
  // ══════════════════════════════════════════

  // 行1: 铺陈画面（主谓宾，及物/不及物搭配自然，读起来通顺）
  const sceneLines = [
    () => [padj(), noun(), tverb(), noun()],       // 温柔的 星光 照亮 远方
    () => ["我", adv(), tverb(), padj(), noun()],   // 我 悄悄 收藏 柔软的 时光
    () => [padj(), noun(), iverb(), "了"],          // 温柔的 钟声 落下了
    () => [noun(), "与", noun()],                    // 星辰 与 大海
    () => ["把", padj(), noun(), tverb(), "了"],     // 把 柔软的 心愿 收藏了
  ];

  // 行2: 主谓宾（及物为主，语义完整）
  const svoLines = [
    () => ["我", tverb(), padj(), noun()],           // 我 珍藏 柔软的 回忆
    () => [padj(), noun(), tverb(), noun()],         // 温柔的 星光 照亮 远方
    () => ["我们", tverb(), padj(), noun()],         // 我们 留下 温柔的 回忆
    () => [noun(), tverb(), noun()],                 // 星光 照亮 远方
    () => ["我", adv(), iverb()],                    // 我 悄悄 绽放
  ];

  // 行3: 意象短片段点题（现成通顺短句，直接成行，最稳妥）
  const imageryLines = [
    () => [img()],
  ];

  // 行4: 虚词自然连接（连词 + 主谓宾）
  const graftLines = [
    () => [conj(), padj(), noun(), tverb(), noun()], // 于是 温柔的 星光 照亮 远方
    () => [conj(), "我", adv(), tverb(), noun()],     // 如果 我 悄悄 收藏 时光
    () => [noun(), "却", iverb(), "了"],              // 风 却 停了
  ];

  // 行5: 短句顿挫（2-3 词块，语法自然）
  const shortPunch = [
    () => [padj(), noun()],        // 温柔的 回忆
    () => [noun(), "与", noun()],  // 星辰 与 大海
    () => [adv(), iverb()],        // 悄悄 绽放
    () => [img()],
  ];

  // 行6: 收束长句（情感落点，主谓完整）
  const closeLines = [
    () => ["我", adv(), tverb(), padj(), noun()],
    () => ["我们", tverb(), padj(), noun()],
    () => [conj(), padj(), noun(), iverb()],
    () => [padj(), noun(), iverb(), "了"],
  ];

  // 去掉形容词词尾「的」，用于格言式短句（如「假如不够快乐」）
  const bareAdj = (w: string) => w.replace(/的$/, "");

  // ─── 按诗人风格定制的诗句模板：优先于通用模板，使成诗贴合对应诗人语感 ───
  // 每个模板都用「主题词库」的取词器（noun/padj/verb/img）组装，保证意象统一。

  // 植物名词池：专供「一株 / 一棵 / 一束」等植物量词句式，避免「一株情书」式不通搭配
  const PLANT_NOUNS = ["木棉", "橡树", "白桦", "梧桐", "青藤", "玫瑰", "百合", "山茶"];
  const plantNoun = () => PLANT_NOUNS[Math.floor(Math.random() * PLANT_NOUNS.length)];

  const THEMED_LINES: Partial<Record<Template, Array<() => string[]>>> = {
    // 汪国真：温暖真挚、富含哲理，多「给予 / 收获 / 远方」对比
    thanks: [
      () => ["我", "珍藏", noun(), "你", "却", "给", "我", "整个", noun()],
      () => [padj(), noun(), "你", tverb(), "整个", noun()],
      () => ["既然", tverb(), noun(), "便", tverb(), noun()],
      () => ["我不去想", noun(), "只要", tverb(), noun()],
      () => ["假如", "生活", "不够", bareAdj(padj()), "我们", "也", "不必", iverb()],
      () => [noun(), "是", "一种", noun()],
      () => ["走向", noun(), "便", "只", "顾", noun()],
      () => ["让", noun(), tverb(), noun()],
      () => ["我", "把", noun(), tverb(), "了"],
      () => [img()],
      () => [noun(), img()],
      () => ["你", "给", "我", padj(), noun()],
    ],
    // 骆一禾：沉毅炽热，歌颂光、火、生命
    birthday: [
      () => [noun(), "还在", iverb()],
      () => ["我们", "最", bareAdj(padj()), "还在", iverb(), "还在", iverb()],
      () => [noun(), tverb(), noun()],
      () => [padj(), noun(), "在", noun(), iverb()],
      () => ["向", noun(), iverb()],
      () => ["我", "歌颂", noun()],
      () => [noun(), "是", noun(), "的", noun()],
      () => [img()],
      () => [padj(), noun(), img()],
      () => ["生命的", noun(), iverb()],
      () => ["没有", "比", noun(), "更", bareAdj(padj()), "的", noun()],
    ],
    // 张枣：平静含蓄，时间在流淌中捕捉永恒
    anniversary: [
      () => [img()],
      () => ["那", "也是", "同样", "的", "一天"],
      () => [padj(), noun(), "在", noun(), iverb()],
      () => ["只要", tverb(), noun(), "便", tverb(), noun()],
      () => [noun(), "便", iverb(), "了"],
      () => ["我", tverb(), noun(), "和", noun()],
      () => [img(), padj(), noun()],
      () => [noun(), "是", padj(), noun()],
      () => ["重复", noun(), "和", noun()],
    ],
    // 舒婷：独立深刻的爱情宣言，平等、并肩、根叶相触
    confession: [
      () => ["我", "如果", "爱", "你"],
      () => ["我", "必须", "是", "你", "近旁", "的", "一株", plantNoun()],
      () => ["根", "紧握", "在", "地下"],
      () => ["叶", "相触", "在", "云里"],
      () => ["我们", tverb(), noun()],
      () => ["不仅", "爱", "你", "也", "爱", "你", tverb(), "的", noun()],
      () => ["也", "爱", "你", tverb(), "的", noun()],
      () => [img()],
      () => [padj(), noun(), "是", padj(), noun()],
      () => ["作为", "树", "的", "形象", "和", "你", "并肩"],
    ],
    // 郑愁予：意象鲜明，岛与海，古典与现代交融
    missing: [
      () => [img()],
      () => ["你", tverb(), "的", padj(), noun(), "我", "正", iverb()],
      () => ["我", tverb(), noun(), "的", noun(), "是", "美丽的", "错误"],
      () => ["我", "不是", noun(), "是", "个", noun()],
      () => [padj(), noun(), iverb()],
      () => ["云", iverb(), "在", noun()],
      () => ["这", "次", "我", tverb(), "你", "是", noun(), "是", noun(), "是", noun()],
      () => [noun(), "在", noun(), iverb()],
      () => ["以", "我", "的", noun(), "为", "你", tverb(), noun()],
      () => [padj(), noun(), "我", tverb()],
    ],
    // 穆旦：思辨坦诚，肯定肉体、自由与生命
    free: [
      () => [img()],
      () => [padj(), "而又", bareAdj(padj()), "的是", "那", noun()],
      () => ["我", tverb(), noun()],
      () => ["光", "影", "声", "色", "都", "已经", iverb()],
      () => [noun(), "在", noun(), iverb()],
      () => ["因为", tverb(), "自身", "的", noun(), "所以", tverb(), noun()],
      () => ["我们", tverb(), noun(), tverb(), noun()],
      () => [padj(), noun(), "是", padj(), noun()],
      () => ["在", noun(), iverb(), "的", noun(), "里"],
      () => ["让", noun(), tverb(), noun()],
    ],
  };

  const themed = (preset?.template && THEMED_LINES[preset.template]) || null;
  const genericAll = [
    ...sceneLines, ...svoLines, ...imageryLines,
    ...graftLines, ...shortPunch, ...closeLines,
  ];

  // ═════ 组装六行：一首诗最多只出现 1 个「固定句式」（诗人签名模板）═════
  // 固定句式指 THEMED_LINES 里可识别的诗人句法（如「我如果爱你」「那也是同样的
  // 一天」「假如生活不够快乐」）。仅在随机一个位置放 1 句，其余行走通用模板，
  // 既保留诗人灵魂、又避免同一句式在诗中反复套用而显生硬。
  const lines: string[][] = [];
  const themedSlot = themed && themed.length ? Math.floor(Math.random() * 6) : -1;
  let themedPlaced = false;
  for (let i = 0; i < 6; i++) {
    if (i === themedSlot && !themedPlaced && themed && themed.length) {
      lines.push(themed[Math.floor(Math.random() * themed.length)]());
      themedPlaced = true;
    } else {
      lines.push(genericAll[Math.floor(Math.random() * genericAll.length)]());
    }
  }

  const result = lines.map((l) => l.filter(Boolean)).filter((l) => l.length > 0);

  // 保底：确保每行至少 2 个词块。优先补「及物动 + 形容词 + 名词」小句，
  // 让意象短句（img）也能接成完整通顺的句子；其次补「形容词 + 名词」。
  for (const line of result) {
    while (line.length < 2) {
      const a = padj();
      const n = noun();
      const v = tverb();
      const extra: string | string[] =
        v && a && n ? [v, a, n]
        : a && n ? [a, n]
        : (n || a || verb() || img() || "远方");
      if (typeof extra === "string") {
        if (!extra || line.includes(extra)) break;
        line.push(extra);
      } else {
        if (!extra.length || extra.some((e) => line.includes(e))) break;
        line.push(...extra);
      }
    }
  }

  return result;
}
