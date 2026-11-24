plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mycamera.eventhelper"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.mycamera.eventhelper"
        minSdk = 26
        targetSdk = 34
        versionCode = 5
        versionName = "1.0.0"
    }

    // 서명 키: GitHub Secrets 에 비공개 키가 있으면 그것을, 없으면 저장소의 고정 디버그 키를 사용
    // (고정 키 → 매번 같은 서명 → 업데이트 설치 시 데이터 유지). 비공개 키 등록 방법: event-helper/README.md
    val privateKs = System.getenv("EH_KEYSTORE")?.takeIf { it.isNotBlank() && file(it).exists() }
    signingConfigs {
        getByName("debug") {
            if (privateKs != null) {
                storeFile = file(privateKs)
                storePassword = System.getenv("EH_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("EH_KEY_ALIAS")
                keyPassword = System.getenv("EH_KEY_PASSWORD") ?: System.getenv("EH_KEYSTORE_PASSWORD")
            } else {
                storeFile = file("../keystore/debug.keystore")
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }
    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("debug") }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}
