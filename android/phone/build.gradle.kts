plugins { id("com.android.application"); id("org.jetbrains.kotlin.plugin.compose") }
// Keep validation resources, BuildConfig and APKs separate from normal builds.
val validationBuild = providers.gradleProperty("validationBuild").orNull == "true"
val hybridUi = providers.gradleProperty("hybridUi").getOrElse("true") == "true"
val bundleWeb by tasks.registering(Exec::class) {
    workingDir(rootProject.projectDir.parentFile)
    commandLine("node", "node_modules/typescript/bin/tsc", "--noEmit")
}
val buildWeb by tasks.registering(Exec::class) {
    dependsOn(bundleWeb)
    workingDir(rootProject.projectDir.parentFile)
    commandLine("node", "node_modules/vite/bin/vite.js", "build", "--outDir", "../android/web-bundle")
    inputs.dir(rootProject.file("../web/src"))
    inputs.dir(rootProject.file("../web/public"))
    inputs.files(rootProject.file("../web/index.html"), rootProject.file("../vite.config.ts"), rootProject.file("../package-lock.json"))
    outputs.dir(rootProject.file("web-bundle"))
}
if (validationBuild) layout.buildDirectory.set(layout.projectDirectory.dir("build-validation"))
android {
    namespace = "pl.przejscie.phone"
    compileSdk = 37
    defaultConfig {
        applicationId = if (validationBuild) "pl.przejscie.app.validation" else "pl.przejscie.app"
        manifestPlaceholders["appLabel"] = if (validationBuild) "Miasto w zasięgu (test)" else "Miasto w zasięgu"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("boolean", "HYBRID_UI", hybridUi.toString())
        val endpoint = providers.gradleProperty("backendUrl").getOrElse("http://10.0.2.2:3081")
        buildConfigField("String", "BACKEND_URL", "\"${endpoint.replace("\"", "") .replace("\\", "") }\"")
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    sourceSets["main"].kotlin.directories.add("../shared/src")
    sourceSets["main"].res.directories.add("../shared/res")
    if (hybridUi) sourceSets["main"].assets.srcDir(rootProject.file("web-bundle"))
}
if (hybridUi) tasks.named("preBuild").configure { dependsOn(buildWeb) }
dependencies {
    implementation("androidx.webkit:webkit:1.16.0")
    implementation("org.maplibre.gl:android-sdk:13.6.1")
    implementation("com.clerk:clerk-android-api:1.1.11")
    implementation(platform("androidx.compose:compose-bom:2026.08.00"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("com.google.android.gms:play-services-wearable:20.0.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
