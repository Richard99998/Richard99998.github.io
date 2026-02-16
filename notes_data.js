/**
 * 1. 文件夹介绍配置 (folderInfo)
 * 格式： "文件夹路径": "介绍文字"
 */
const folderInfo = {
    "Optimization": "这里包含凸优化、线性规划等核心算法笔记。",
    "Optimization/Convex": "凸分析专题，包含强对偶理论。", // 子文件夹介绍
    "PDE": "偏微分方程相关笔记，包含热传导方程与波动方程。",
    "PDE/Basic": "基础方程推导。",
    "Probability": "概率论与随机过程学习记录。"
};

/**
 * 2. 笔记数据列表 (notesData)
 * 关键点：使用斜杠 "/" 来表示子文件夹。
 * 例如 category: "Optimization/Convex" 会在 Optimization 下面创建一个 Convex 文件夹。
 */
const notesData = [
    // --- Optimization 及其子文件夹 ---
    {
        title: "LP Strong Duality",
        category: "Optimization/Convex", // 【注意】这里加了 /Convex
        date: "2024-05-20",
        file: "LP Strong Duality.pdf"
    },
    {
        title: "KKT Conditions",
        category: "Optimization/Convex",
        date: "2024-06-10",
        file: "Constraint qualification and KKT.pdf"
    },
    {
        title: "General Optimization Intro",
        category: "Optimization", // 这个直接放在 Optimization 根目录下
        date: "2024-01-01",
        file: "Intro_Opt.pdf"
    },

    // --- PDE 及其子文件夹 ---
    {
        title: "Heat Equation",
        category: "PDE/Basic",
        date: "2024-04-15",
        file: "Heat Equation.pdf"
    },
    {
        title: "Wave Equation",
        category: "PDE/Basic",
        date: "2024-04-20",
        file: "Wave_Equation.pdf"
    },
    {
        title: "Conservation Law",
        category: "PDE",
        date: "2024-05-01",
        file: "CONSERVATION_LAW.pdf"
    },

    // --- 其他 ---
    {
        title: "Seminar Note",
        category: "Seminars",
        date: "2024-09-01",
        file: "Seminar_note.pdf"
    }
];
