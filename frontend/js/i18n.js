const translations = {
    en: {
        // Navigation
        "nav_dashboard": "Dashboard",
        "nav_voting": "Formal Voting",
        "nav_messaging": "Messaging",
        "nav_polls": "Opinion Polls",
        "nav_reviews": "Reviews",
        "nav_gallery": "Gallery",
        "nav_properties": "Properties",
        "nav_settings": "Account Settings",
        
        // Settings Page
        "settings_title": "Account Settings",
        "settings_desc": "Manage your preferences and community profile.",
        "appearance": "Appearance",
        "theme": "Theme",
        "theme_dark": "Dark Mode",
        "theme_light": "Light Mode",
        "language": "Language",
        "save_changes": "Save Changes",
        
        // General UI
        "welcome": "Welcome Back"
    },
    te: {
        // Telugu
        "nav_dashboard": "డాష్‌బోర్డ్",
        "nav_voting": "అధికారిక ఓటింగ్",
        "nav_messaging": "మెసేజింగ్",
        "nav_polls": "అభిప్రాయ సేకరణలు",
        "nav_reviews": "సమీక్షలు",
        "nav_gallery": "గ్యాలరీ",
        "nav_properties": "ఆస్తులు",
        "nav_settings": "ఖాతా సెట్టింగ్‌లు",
        
        "settings_title": "ఖాతా సెట్టింగ్‌లు",
        "settings_desc": "మీ ప్రాధాన్యతలు మరియు కమ్యూనిటీ ప్రొఫైల్‌ను నిర్వహించండి.",
        "appearance": "కనిపించే విధానం (Appearance)",
        "theme": "థీమ్",
        "theme_dark": "డార్క్ మోడ్",
        "theme_light": "లైట్ మోడ్",
        "language": "భాష",
        "save_changes": "మార్పులను సేవ్ చేయండి",
        
        "welcome": "తిరిగి స్వాగతం"
    },
    hi: {
        // Hindi
        "nav_dashboard": "डैशबोर्ड",
        "nav_voting": "औपचारिक मतदान",
        "nav_messaging": "मैसेजिंग",
        "nav_polls": "जनमत सर्वेक्षण",
        "nav_reviews": "समीक्षाएं",
        "nav_gallery": "गैलरी",
        "nav_properties": "संपत्तियां",
        "nav_settings": "खाता सेटिंग्स",
        
        "settings_title": "खाता सेटिंग्स",
        "settings_desc": "अपनी प्राथमिकताएं और सामुदायिक प्रोफ़ाइल प्रबंधित करें।",
        "appearance": "दिखावट",
        "theme": "थीम",
        "theme_dark": "डार्क मोड",
        "theme_light": "लाइट मोड",
        "language": "भाषा",
        "save_changes": "परिवर्तन सहेजें",
        
        "welcome": "वापसी पर स्वागत है"
    }
};

class I18n {
    constructor() {
        this.currentLang = localStorage.getItem('gcms_lang') || 'en';
    }

    setLanguage(langCode) {
        if (translations[langCode]) {
            this.currentLang = langCode;
            localStorage.setItem('gcms_lang', langCode);
            this.applyTranslations();
        }
    }

    t(key) {
        return translations[this.currentLang][key] || translations['en'][key] || key;
    }

    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.innerText = this.t(key);
        });
    }
}

const appI18n = new I18n();
