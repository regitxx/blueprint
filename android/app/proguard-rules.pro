# kotlinx.serialization keeps generated serializers via @Serializable; keep them.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class com.blueprint.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}
