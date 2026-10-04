plugins { id("com.android.application"); id("org.jetbrains.kotlin.plugin.compose") }
val validationBuild = providers.gradleProperty("validationBuild").orNull == "true"
if (validationBuild) layout.buildDirectory.set(layout.projectDirectory.dir("build-validation"))
android {
    namespace = "pl.przejscie.wear"
    compileSdk = 37
    defaultConfig {
        applicationId = if (validationBuild) "pl.przejscie.app.validation" else "pl.przejscie.app"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
    buildFeatures { compose = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    sourceSets["main"].kotlin.directories.add("../shared/src")
    sourceSets["main"].res.directories.add("../shared/res")
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.08.00"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.wear.compose:compose-material:1.5.0")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
    testImplementation("junit:junit:4.13.2")
}
